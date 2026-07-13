import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PROFILE_THEMES } from "@/lib/profile";

const TEXT_FIELDS = ["display_name", "real_name", "location"] as const;
const STATUSES = ["online", "away", "invisible"];

/** Update the signed-in user's own profile fields */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sets: string[] = [];
  const values: (string | null)[] = [];

  for (const field of TEXT_FIELDS) {
    if (field in body) {
      const raw = body[field];
      if (raw !== null && typeof raw !== "string") {
        return NextResponse.json({ error: `${field} must be a string` }, { status: 400 });
      }
      const value = typeof raw === "string" ? raw.trim().slice(0, 64) : null;
      sets.push(`${field} = ?`);
      values.push(value || null);
    }
  }
  if ("theme" in body) {
    if (typeof body.theme !== "string" || !PROFILE_THEMES[body.theme]) {
      return NextResponse.json({ error: "Unknown theme" }, { status: 400 });
    }
    sets.push("theme = ?");
    values.push(body.theme);
  }
  if ("status" in body) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    }
    sets.push("status = ?");
    values.push(body.status);
  }
  if ("featured_badge" in body) {
    const v = body.featured_badge;
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ error: "Bad featured_badge" }, { status: 400 });
    }
    sets.push("featured_badge = ?");
    values.push(v ? String(v).slice(0, 32) : null);
  }
  if ("background_url" in body) {
    const v = body.background_url;
    if (v !== null && (typeof v !== "string" || v.length > 500)) {
      return NextResponse.json({ error: "Bad background_url" }, { status: 400 });
    }
    sets.push("background_url = ?");
    values.push(v || null);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  getDb()
    .prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values, user.id);
  return NextResponse.json({ ok: true });
}
