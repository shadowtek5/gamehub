import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getDb, UserRow } from "./db";

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** API tokens are shown once; only their SHA-256 is stored */
export function hashApiToken(token: string): string {
  return sha256(token);
}

function bearerUser(authHeader: string): SessionUser | null {
  const raw = authHeader.slice(7).trim();
  if (!raw) return null;
  const row = getDb()
    .prepare(
      `SELECT u.id, u.username, u.role, t.id AS token_id, t.scope
       FROM api_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ? AND (t.expires_at IS NULL OR t.expires_at > datetime('now'))`
    )
    .get(hashApiToken(raw)) as
    | { id: number; username: string; role: string | null; token_id: number; scope: string }
    | undefined;
  if (!row) return null;
  getDb()
    .prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?")
    .run(row.token_id);
  return toSessionUser(row.id, row.username, capRole(row.role, row.scope));
}

const SESSION_COOKIE = "gh_session";
const SESSION_DAYS = 30;

export type UserRole = "admin" | "editor" | "viewer";

export interface SessionUser {
  id: number;
  username: string;
  role: UserRole;
  /** Full access: user management, settings, scans */
  isAdmin: boolean;
  /** Can modify games, metadata, artwork, firmware (admin implies editor) */
  isEditor: boolean;
}

const ROLE_RANK: Record<UserRole, number> = { viewer: 0, editor: 1, admin: 2 };

function toSessionUser(id: number, username: string, role: string | null): SessionUser {
  const r: UserRole = role === "admin" || role === "editor" ? role : "viewer";
  return {
    id,
    username,
    role: r,
    isAdmin: r === "admin",
    isEditor: r === "admin" || r === "editor",
  };
}

/** A token scope caps the effective role — a "viewer" token from an admin
 *  can only read, no matter who owns it. */
function capRole(userRole: string | null, scope: string): SessionUser["role"] {
  const base: UserRole =
    userRole === "admin" || userRole === "editor" ? userRole : "viewer";
  if (scope === "full") return base;
  const cap: UserRole = scope === "editor" ? "editor" : "viewer";
  return ROLE_RANK[base] <= ROLE_RANK[cap] ? base : cap;
}

export async function registerUser(
  username: string,
  password: string,
  role?: UserRole
): Promise<{ user?: SessionUser; error?: string }> {
  username = username.trim();
  if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
    return { error: "Username must be 2-32 characters (letters, numbers, _ . -)" };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }
  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return { error: "Username is already taken" };

  const count = (db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
  // First account becomes admin; invites can grant a specific role
  const finalRole: UserRole = count === 0 ? "admin" : (role ?? "viewer");
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (username, password_hash, is_admin, role) VALUES (?, ?, ?, ?)")
    .run(username, hash, finalRole === "admin" ? 1 : 0, finalRole);
  return {
    user: toSessionUser(Number(info.lastInsertRowid), username, finalRole),
  };
}

// A constant bcrypt hash compared against when the username doesn't exist, so a
// missing account takes the same ~time as a wrong password — removes the login
// timing oracle that would otherwise enumerate valid usernames.
const DUMMY_HASH = bcrypt.hashSync("gamehub-nonexistent-account", 10);

export function verifyCredentials(username: string, password: string): SessionUser | null {
  const row = getDb()
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username.trim()) as UserRow | undefined;
  if (!row) {
    bcrypt.compareSync(password, DUMMY_HASH); // equalize timing, ignore result
    return null;
  }
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return toSessionUser(row.id, row.username, row.role);
}

/** True when the current request arrived over HTTPS (behind a reverse proxy,
 *  the standard way this app is exposed) — used to mark auth cookies Secure. */
export async function isSecureRequest(): Promise<boolean> {
  try {
    const proto = (await headers()).get("x-forwarded-proto") ?? "";
    return proto.split(",")[0].trim() === "https";
  } catch {
    return false;
  }
}

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  // Only the SHA-256 of the session token is stored — a DB/backup read can't
  // yield a replayable session. The raw token lives only in the user's cookie.
  getDb()
    .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .run(sha256(token), userId, expires.toISOString());
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
    // Secure when served over HTTPS; omitted on plain-HTTP LAN installs so the
    // cookie is still sent (a Secure cookie would never reach an http:// app).
    secure: await isSecureRequest(),
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    getDb().prepare("DELETE FROM sessions WHERE token = ?").run(sha256(token));
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Sign out every OTHER session for a user, keeping the caller's current one.
 *  Called after a self-service password change so a stolen/old session can't
 *  outlive the credential change. */
export async function revokeOtherSessions(userId: number) {
  const cookieStore = await cookies();
  const current = cookieStore.get(SESSION_COOKIE)?.value;
  const db = getDb();
  if (current) {
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(userId, sha256(current));
  } else {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  // API access: Authorization: Bearer ghk_… (personal tokens from /account)
  try {
    const hdrs = await headers();
    const auth = hdrs.get("authorization");
    if (auth?.startsWith("Bearer ")) return bearerUser(auth);
  } catch {
    // headers() unavailable in some render contexts — fall through to cookies
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.id, u.username, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .get(sha256(token)) as { id: number; username: string; role: string | null } | undefined;
  if (!row) return null;
  return toSessionUser(row.id, row.username, row.role);
}

// ---------- API route auth guards ----------
// Shared helpers so a new route can't accidentally ship without a check. Each
// returns the SessionUser, or a NextResponse to return immediately:
//   const g = await requireAdmin(); if (g instanceof NextResponse) return g;
//   const user = g;  // typed SessionUser

export async function requireAdmin(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return user;
}

export async function requireEditor(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  return user;
}

export async function requireLogin(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return user;
}

/** For pages: redirect to /login when not signed in */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export function hasAnyUsers(): boolean {
  const count = (getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
  return count > 0;
}
