import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, ensureUserRom } from "@/lib/db";

/** Your personal data for a game: notes, rating, difficulty, completion %, hidden */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const romId = Number(id);
  const rom = getDb().prepare("SELECT id FROM roms WHERE id = ?").get(romId);
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  ensureUserRom(user.id, romId);

  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if ("notes" in body) {
    const v = body.notes;
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ error: "notes must be a string" }, { status: 400 });
    }
    sets.push("notes = ?");
    values.push(typeof v === "string" ? v.trim().slice(0, 5000) || null : null);
  }
  const clamped = (v: unknown, min: number, max: number): number | null | undefined => {
    if (v === null) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  if ("rating" in body) {
    const v = clamped(body.rating, 1, 10);
    if (v === undefined) return NextResponse.json({ error: "rating must be 1-10" }, { status: 400 });
    sets.push("user_rating = ?");
    values.push(v);
  }
  if ("difficulty" in body) {
    const v = clamped(body.difficulty, 1, 10);
    if (v === undefined) {
      return NextResponse.json({ error: "difficulty must be 1-10" }, { status: 400 });
    }
    sets.push("difficulty = ?");
    values.push(v);
  }
  if ("completion" in body) {
    const v = clamped(body.completion, 0, 100);
    if (v === undefined) {
      return NextResponse.json({ error: "completion must be 0-100" }, { status: 400 });
    }
    sets.push("completion = ?");
    values.push(v);
  }
  if ("hidden" in body) {
    sets.push("hidden = ?");
    values.push(body.hidden === true ? 1 : 0);
  }
  if ("hero_plain" in body) {
    sets.push("hero_plain = ?");
    values.push(body.hero_plain === true ? 1 : 0);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  getDb()
    .prepare(`UPDATE user_roms SET ${sets.join(", ")} WHERE user_id = ? AND rom_id = ?`)
    .run(...values, user.id, romId);
  return NextResponse.json({ ok: true });
}
