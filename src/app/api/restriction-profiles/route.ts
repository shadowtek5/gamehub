import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  listRestrictionProfiles,
  createRestrictionProfile,
  type RestrictionInput,
} from "@/lib/db";

/** Validate a restriction-profile body into a RestrictionInput, or an error. */
function parseBody(body: unknown): RestrictionInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "A profile name is required" };
  if (name.length > 60) return { error: "Name too long" };

  let allowedSystems: string[] | null = null;
  if (b.allowedSystems === null || b.allowedSystems === undefined) {
    allowedSystems = null;
  } else if (Array.isArray(b.allowedSystems) && b.allowedSystems.every((s) => typeof s === "string")) {
    allowedSystems = b.allowedSystems as string[];
  } else {
    return { error: "allowedSystems must be an array of slugs or null" };
  }

  let maxRating: number | null = null;
  if (b.maxRating !== null && b.maxRating !== undefined) {
    const n = Number(b.maxRating);
    if (!Number.isFinite(n) || n < 0 || n > 21) return { error: "maxRating out of range" };
    maxRating = n;
  }

  let dailyLimitMinutes: number | null = null;
  if (b.dailyLimitMinutes != null && b.dailyLimitMinutes !== "") {
    const n = Number(b.dailyLimitMinutes);
    if (Number.isFinite(n) && n > 0) dailyLimitMinutes = Math.round(n);
  }
  // Both hours must be present to define a window, else it's "anytime".
  let allowedStartHour: number | null = null;
  let allowedEndHour: number | null = null;
  if (b.allowedStartHour != null && b.allowedEndHour != null) {
    const s = Number(b.allowedStartHour);
    const e = Number(b.allowedEndHour);
    if (Number.isFinite(s) && Number.isFinite(e)) {
      allowedStartHour = Math.max(0, Math.min(23, Math.round(s)));
      allowedEndHour = Math.max(0, Math.min(23, Math.round(e)));
    }
  }

  return {
    name,
    allowedSystems,
    maxRating,
    hideUnrated: b.hideUnrated === true,
    dailyLimitMinutes,
    allowedStartHour,
    allowedEndHour,
  };
}

export async function GET() {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  return NextResponse.json({ profiles: listRestrictionProfiles() });
}

export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  const parsed = parseBody(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const id = createRestrictionProfile(parsed);
  return NextResponse.json({ ok: true, id });
}
