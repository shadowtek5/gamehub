import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSessionUser } from "@/lib/auth";
import { getDb, listUsersAdmin } from "@/lib/db";
import { logEvent } from "@/lib/eventLog";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json({ users: listUsersAdmin() });
}

/** Create a user: { username, password, isAdmin? } */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const role = ["admin", "editor", "viewer"].includes(body.role)
    ? body.role
    : body.isAdmin === true
      ? "admin"
      : "viewer";

  if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
    return NextResponse.json(
      { error: "Username must be 2-32 characters (letters, numbers, _ . -)" },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }
  const db = getDb();
  if (db.prepare("SELECT id FROM users WHERE username = ?").get(username)) {
    return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
  }
  const info = db
    .prepare("INSERT INTO users (username, password_hash, is_admin, role) VALUES (?, ?, ?, ?)")
    .run(username, bcrypt.hashSync(password, 10), role === "admin" ? 1 : 0, role);
  logEvent({
    category: "user",
    action: "user.created",
    summary: `Created user "${username}" (${role})`,
    detail: { username, role, id: Number(info.lastInsertRowid) },
    actor: user,
  });
  return NextResponse.json({ ok: true, id: Number(info.lastInsertRowid) });
}
