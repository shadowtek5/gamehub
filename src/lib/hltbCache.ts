// Server-only: resolve + cache HowLongToBeat completion times on a rom row.
// Looked up once via the HLTB provider, then cached on the row for 30 days;
// shared by the desktop and mobile game pages so they never diverge.

import { getDb } from "./db";
import { hltbLookup, type HltbTimes } from "./providers/hltb";

const TTL_MS = 30 * 24 * 3600 * 1000;

export type { HltbTimes };

/** The rom's HLTB times, from the 30-day cache or a fresh lookup (persisted). */
export async function getRomHltb(rom: {
  id: number;
  title: string;
  hltb: string | null;
  hltb_checked_at: string | null;
}): Promise<HltbTimes | null> {
  const stale = !rom.hltb_checked_at || Date.now() - Date.parse(rom.hltb_checked_at) > TTL_MS;
  if (rom.hltb && !stale) {
    try {
      return JSON.parse(rom.hltb) as HltbTimes;
    } catch {
      return null;
    }
  }
  const times = await hltbLookup(rom.title);
  // Store "" on a no-match so we don't re-hit HLTB for 30 days.
  getDb()
    .prepare("UPDATE roms SET hltb = ?, hltb_checked_at = datetime('now') WHERE id = ?")
    .run(times ? JSON.stringify(times) : "", rom.id);
  return times;
}

/** True when the times object carries at least one usable duration. */
export function hasHltb(t: HltbTimes | null): t is HltbTimes {
  return !!(t && (t.main || t.plus || t.completionist));
}
