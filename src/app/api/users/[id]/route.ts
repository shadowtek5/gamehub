import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { getSessionUser } from "@/lib/auth";
import { getDb, setUserRestrictionProfile, getRestrictionProfile } from "@/lib/db";
import { logEvent } from "@/lib/eventLog";
import { getDataDir } from "../../../../lib/dataDir";

function otherAdminExists(excludeId: number): boolean {
  return !!getDb()
    .prepare("SELECT id FROM users WHERE is_admin = 1 AND id != ? LIMIT 1")
    .get(excludeId);
}

const ROLES = ["admin", "editor", "viewer"];

/** Update a user: { role?: "admin"|"editor"|"viewer", password?: string } */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await params;
  const targetId = Number(id);
  const db = getDb();
  const target = db.prepare("SELECT id, is_admin, username FROM users WHERE id = ?").get(targetId) as
    | { id: number; is_admin: number; username: string }
    | undefined;
  if (!target) return NextResponse.json({ error: "No such user" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (typeof body.role === "string" && ROLES.includes(body.role)) {
    const toAdmin = body.role === "admin";
    if (targetId === user.id && !toAdmin) {
      return NextResponse.json(
        { error: "You can't remove your own admin rights" },
        { status: 400 }
      );
    }
    if (!toAdmin && target.is_admin === 1 && !otherAdminExists(targetId)) {
      return NextResponse.json(
        { error: "At least one admin must remain" },
        { status: 400 }
      );
    }
    db.prepare("UPDATE users SET role = ?, is_admin = ? WHERE id = ?").run(
      body.role,
      toAdmin ? 1 : 0,
      targetId
    );
    // Role changes end their sessions so stale permissions can't linger
    if (targetId !== user.id) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetId);
    logEvent({
      category: "user",
      action: "user.role_changed",
      summary: `Changed ${target.username}'s role to ${body.role}`,
      detail: { username: target.username, role: body.role, id: targetId },
      actor: user,
    });
  }

  // Age restriction: assign a profile by id, or null to clear (full library).
  if ("restrictionProfileId" in body) {
    const v = body.restrictionProfileId;
    if (v === null) {
      setUserRestrictionProfile(targetId, null);
      logEvent({
        category: "user",
        action: "user.restriction_assigned",
        summary: `Cleared content restriction for ${target.username}`,
        detail: { username: target.username, id: targetId, profileId: null },
        actor: user,
      });
    } else if (Number.isInteger(v) && getRestrictionProfile(v)) {
      setUserRestrictionProfile(targetId, v);
      const profile = getRestrictionProfile(v);
      logEvent({
        category: "user",
        action: "user.restriction_assigned",
        summary: `Assigned restriction "${profile?.name ?? v}" to ${target.username}`,
        detail: { username: target.username, id: targetId, profileId: v, profileName: profile?.name },
        actor: user,
      });
    } else {
      return NextResponse.json({ error: "No such restriction profile" }, { status: 400 });
    }
  }

  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      bcrypt.hashSync(body.password, 10),
      targetId
    );
    // Force re-login everywhere with the new password (except when changing your own)
    if (targetId !== user.id) {
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetId);
    }
    logEvent({
      category: "user",
      action: "user.password_reset",
      summary:
        targetId === user.id
          ? "Changed their own password"
          : `Reset password for ${target.username}`,
      detail: { username: target.username, id: targetId },
      severity: "warn",
      actor: user,
    });
  }

  return NextResponse.json({ ok: true });
}

/** Delete a user and everything that belongs to them */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await params;
  const targetId = Number(id);
  if (targetId === user.id) {
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 });
  }
  const db = getDb();
  const target = db.prepare("SELECT id, is_admin, username FROM users WHERE id = ?").get(targetId) as
    | { id: number; is_admin: number; username: string }
    | undefined;
  if (!target) return NextResponse.json({ error: "No such user" }, { status: 404 });
  if (target.is_admin === 1 && !otherAdminExists(targetId)) {
    return NextResponse.json({ error: "At least one admin must remain" }, { status: 400 });
  }

  // Cascades take sessions, favorites/playtime, collections, save states,
  // and profile comments with the row
  db.prepare("DELETE FROM users WHERE id = ?").run(targetId);
  logEvent({
    category: "user",
    action: "user.deleted",
    summary: `Deleted user "${target.username}"`,
    detail: { username: target.username, id: targetId },
    severity: "warn",
    actor: user,
  });

  // Their files: save states and profile media
  for (const dir of [
    path.join(getDataDir(), "saves", String(targetId)),
    path.join(getDataDir(), "media", "users", String(targetId)),
  ]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }

  return NextResponse.json({ ok: true });
}
