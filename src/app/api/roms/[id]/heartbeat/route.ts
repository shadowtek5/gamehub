import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, ensureUserRom, setPlaying, addDailyPlay, playAllowance } from "@/lib/db";

/** Called every 60s by the play page to track playtime.
 *  We bump the per-user, per-game playtime + last_played_at on `user_roms` —
 *  that row IS the play history (what each user last played and every game
 *  they've ever played). We deliberately do NOT write an activity-feed entry:
 *  a "Played this game" post every session just floods the feed. The
 *  last-played surfaces (Home › Friends, and the friends-who-played strips)
 *  read `user_roms` directly instead. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const romId = Number(id);
  ensureUserRom(user.id, romId);
  getDb()
    .prepare(
      `UPDATE user_roms
         SET playtime_seconds = playtime_seconds + 60,
             last_played_at = datetime('now')
         WHERE user_id = ? AND rom_id = ?`
    )
    .run(user.id, romId);
  // Live "now playing" presence for friends (also refreshes last_seen).
  setPlaying(user.id, romId);

  // Kid-profile enforcement: tally today's play, then report whether the user
  // must stop now (daily limit hit or outside allowed hours). The player exits
  // when blocked. No-op for unrestricted users.
  addDailyPlay(user.id, 60);
  const allow = playAllowance(user.id);
  return NextResponse.json({ ok: true, blocked: !allow.allowed, reason: allow.reason });
}
