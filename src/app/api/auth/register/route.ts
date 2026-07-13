import { NextRequest, NextResponse } from "next/server";
import { registerUser, createSession, hasAnyUsers, UserRole } from "@/lib/auth";
import { getDb, getSetting } from "@/lib/db";
import { logEvent } from "@/lib/eventLog";

export async function POST(req: NextRequest) {
  const { username, password, invite } = await req.json().catch(() => ({}));
  if (typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  const firstRun = !hasAnyUsers();
  let inviteRole: UserRole | undefined;

  if (!firstRun) {
    // A valid single-use invite always works; otherwise open registration
    // must be enabled in Settings -> Users
    if (typeof invite === "string" && invite) {
      const row = getDb()
        .prepare(
          "SELECT token, role FROM invites WHERE token = ? AND used_by IS NULL AND expires_at > datetime('now')"
        )
        .get(invite) as { token: string; role: string } | undefined;
      if (!row) {
        return NextResponse.json(
          { error: "This invite link is invalid, used, or expired" },
          { status: 403 }
        );
      }
      inviteRole =
        row.role === "admin" || row.role === "editor" ? (row.role as UserRole) : "viewer";
    } else if (getSetting("registration_open") === "off") {
      return NextResponse.json(
        { error: "Registration is disabled — ask an admin for an invite link" },
        { status: 403 }
      );
    }
  }

  const { user, error } = await registerUser(username, password, inviteRole);
  if (error || !user) {
    return NextResponse.json({ error: error ?? "Registration failed" }, { status: 400 });
  }
  if (inviteRole && typeof invite === "string") {
    // Atomically claim the invite: the conditional UPDATE only affects a row
    // that is still unused and unexpired, and SQLite serializes writes — so of
    // N concurrent registrations racing the same invite, exactly one sees
    // changes === 1. Any loser rolls back the account it just created, closing
    // the double-redeem hole (one invite → one account, at the granted role).
    const claim = getDb()
      .prepare(
        "UPDATE invites SET used_by = ? WHERE token = ? AND used_by IS NULL AND expires_at > datetime('now')"
      )
      .run(user.id, invite);
    if (claim.changes !== 1) {
      getDb().prepare("DELETE FROM users WHERE id = ?").run(user.id);
      return NextResponse.json(
        { error: "This invite link is invalid, used, or expired" },
        { status: 403 }
      );
    }
  }
  logEvent({
    category: "user",
    action: "user.registered",
    summary: firstRun
      ? `First account "${user.username}" registered (admin)`
      : `New user "${user.username}" registered${inviteRole ? " via invite" : ""} (${user.role})`,
    detail: { username: user.username, role: user.role, id: user.id, firstRun, viaInvite: !!inviteRole },
    actor: { id: user.id, name: user.username },
  });
  await createSession(user.id);
  return NextResponse.json({ ok: true, user });
}
