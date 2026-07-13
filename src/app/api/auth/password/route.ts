import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSessionUser, revokeOtherSessions } from "@/lib/auth";
import { getDb, UserRow } from "@/lib/db";

/** Change the signed-in user's password (requires the current one) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const current = String(body.current ?? "");
  const next = String(body.next ?? "");
  if (next.length < 6) {
    return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
  }

  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as
    | UserRow
    | undefined;
  if (!row || !bcrypt.compareSync(current, row.password_hash)) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
  }
  getDb()
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(bcrypt.hashSync(next, 10), user.id);
  // A password change signs out this user's other sessions (any old/stolen
  // cookie stops working); the current session is kept.
  await revokeOtherSessions(user.id);
  return NextResponse.json({ ok: true });
}
