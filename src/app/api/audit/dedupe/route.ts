import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb, ensureUserRom } from "@/lib/db";
import { logEvent } from "@/lib/eventLog";

/** Non-destructive 1G1R cleanup: HIDE the redundant copies (never delete files).
 *  Body: { hideIds: number[], unhide?: boolean }. Hidden games move to the
 *  Hidden tab and can be restored, so this is fully reversible. Scoped to the
 *  acting admin's grids (uses the existing per-user hidden flag). */
export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  const user = g;

  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.hideIds)
    ? body.hideIds.filter((n: unknown) => Number.isInteger(n)).slice(0, 5000)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "hideIds must be a non-empty array" }, { status: 400 });
  }
  const hiddenValue = body.unhide === true ? 0 : 1;

  const db = getDb();
  const valid = db
    .prepare(`SELECT id FROM roms WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as { id: number }[];
  const setHidden = db.prepare(
    "UPDATE user_roms SET hidden = ? WHERE user_id = ? AND rom_id = ?"
  );
  const run = db.transaction((rows: { id: number }[]) => {
    for (const r of rows) {
      ensureUserRom(user.id, r.id);
      setHidden.run(hiddenValue, user.id, r.id);
    }
  });
  run(valid);

  logEvent({
    category: "maintenance",
    action: "maintenance.dedupe",
    summary:
      hiddenValue === 1
        ? `1G1R cleanup hid ${valid.length} duplicate cop${valid.length === 1 ? "y" : "ies"}`
        : `Restored ${valid.length} hidden cop${valid.length === 1 ? "y" : "ies"}`,
    detail: { updated: valid.length, hidden: hiddenValue === 1 },
    actor: user,
  });
  return NextResponse.json({ ok: true, updated: valid.length, hidden: hiddenValue === 1 });
}
