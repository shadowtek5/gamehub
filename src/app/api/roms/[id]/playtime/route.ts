import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, ensureUserRom, addDailyPlay } from "@/lib/db";

/** Longest single session a client may report (a stuck "playing" state shouldn't add days). */
const MAX_SESSION_SECONDS = 12 * 60 * 60;

/** Records a finished play session from a handheld client (e.g. GameHub Downloader after
 *  the game was launched in an emulator on the device). Body: `{ seconds }`. Unlike the
 *  per-minute heartbeat this adds the whole session at once and doesn't touch "now playing";
 *  clients clear that with POST /api/roms/:id/stop-playing. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const romId = Number(id);
  if (!Number.isInteger(romId) || !getDb().prepare("SELECT 1 FROM roms WHERE id = ?").get(romId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const seconds = Math.round(Number(body?.seconds));
  if (!Number.isFinite(seconds) || seconds < 0) {
    return NextResponse.json({ error: "seconds must be a positive number" }, { status: 400 });
  }
  const added = Math.min(seconds, MAX_SESSION_SECONDS);
  if (added > 0) {
    ensureUserRom(user.id, romId);
    getDb()
      .prepare(
        `UPDATE user_roms
           SET playtime_seconds = playtime_seconds + ?,
               last_played_at = datetime('now')
           WHERE user_id = ? AND rom_id = ?`
      )
      .run(added, user.id, romId);
    addDailyPlay(user.id, added);
  }
  const row = getDb()
    .prepare("SELECT playtime_seconds FROM user_roms WHERE user_id = ? AND rom_id = ?")
    .get(user.id, romId) as { playtime_seconds: number } | undefined;
  return NextResponse.json({ ok: true, added, playtimeSeconds: row?.playtime_seconds ?? 0 });
}
