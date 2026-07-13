import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSessionUser } from "@/lib/auth";
import { getDb, getSetting, setSetting } from "@/lib/db";

/** List active invite links + the open-registration setting (admin) */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const invites = getDb()
    .prepare(
      `SELECT token, role, created_at, expires_at FROM invites
       WHERE used_by IS NULL AND expires_at > datetime('now')
       ORDER BY created_at DESC`
    )
    .all();
  return NextResponse.json({
    invites,
    registrationOpen: getSetting("registration_open") !== "off",
  });
}

/** Create an invite ({ role }) or toggle registration ({ registrationOpen }) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.registrationOpen === "boolean") {
    setSetting("registration_open", body.registrationOpen ? "on" : "off");
    return NextResponse.json({ ok: true, registrationOpen: body.registrationOpen });
  }

  const role = ["admin", "editor", "viewer"].includes(body.role) ? body.role : "viewer";
  const token = crypto.randomBytes(16).toString("base64url");
  getDb()
    .prepare(
      "INSERT INTO invites (token, role, created_by, expires_at) VALUES (?, ?, ?, datetime('now', '+7 days'))"
    )
    .run(token, role, user.id);
  return NextResponse.json({ ok: true, token, role });
}

/** Revoke an invite: ?token= */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const token = req.nextUrl.searchParams.get("token");
  if (token) getDb().prepare("DELETE FROM invites WHERE token = ?").run(token);
  return NextResponse.json({ ok: true });
}
