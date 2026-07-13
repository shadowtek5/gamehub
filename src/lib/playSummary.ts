// Personal "Year in Review"-style play breakdown for a user: total time, the
// completion split, most-played games, time by system, and favourite genres.
// Read-only aggregation over user_roms + roms — extends the basic profileStats
// counters with the richer breakdowns the profile page didn't have.

import { getDb } from "./db";
import { platformBySlug } from "./platforms";

export interface PlaySummary {
  totalSeconds: number;
  totalHours: number;
  gamesPlayed: number;
  status: { backlog: number; playing: number; beaten: number; dropped: number };
  topGames: { id: number; title: string; platform_slug: string; platform_name: string; hours: number }[];
  bySystem: { slug: string; name: string; hours: number }[];
  topGenres: { genre: string; count: number }[];
}

const toHours = (sec: number) => Math.round(sec / 360) / 10; // 1 decimal

export function playSummary(userId: number): PlaySummary {
  const db = getDb();

  const agg = db
    .prepare(
      `SELECT COALESCE(SUM(playtime_seconds), 0) AS seconds,
              COUNT(CASE WHEN playtime_seconds > 0 OR last_played_at IS NOT NULL THEN 1 END) AS played
       FROM user_roms WHERE user_id = ?`
    )
    .get(userId) as { seconds: number; played: number };

  const status: PlaySummary["status"] = { backlog: 0, playing: 0, beaten: 0, dropped: 0 };
  for (const r of db
    .prepare(
      `SELECT play_status AS s, COUNT(*) AS c FROM user_roms
       WHERE user_id = ? AND play_status IS NOT NULL GROUP BY play_status`
    )
    .all(userId) as { s: string; c: number }[]) {
    if (r.s === "backlog" || r.s === "playing" || r.s === "beaten" || r.s === "dropped") {
      status[r.s] = r.c;
    }
  }

  const topGames = (
    db
      .prepare(
        `SELECT r.id, r.title, r.platform_slug, ur.playtime_seconds AS sec
         FROM user_roms ur JOIN roms r ON r.id = ur.rom_id
         WHERE ur.user_id = ? AND ur.playtime_seconds > 0 AND r.missing = 0
         ORDER BY ur.playtime_seconds DESC LIMIT 10`
      )
      .all(userId) as { id: number; title: string; platform_slug: string; sec: number }[]
  ).map((g) => ({
    id: g.id,
    title: g.title,
    platform_slug: g.platform_slug,
    platform_name: platformBySlug(g.platform_slug)?.name ?? g.platform_slug,
    hours: toHours(g.sec),
  }));

  const bySystem = (
    db
      .prepare(
        `SELECT r.platform_slug AS slug, SUM(ur.playtime_seconds) AS sec
         FROM user_roms ur JOIN roms r ON r.id = ur.rom_id
         WHERE ur.user_id = ? AND ur.playtime_seconds > 0
         GROUP BY r.platform_slug ORDER BY sec DESC LIMIT 8`
      )
      .all(userId) as { slug: string; sec: number }[]
  ).map((x) => ({ slug: x.slug, name: platformBySlug(x.slug)?.name ?? x.slug, hours: toHours(x.sec) }));

  // Genres are comma-joined ("Platform, Adventure"); tally each across played games.
  const counts = new Map<string, number>();
  for (const { g } of db
    .prepare(
      `SELECT r.genre AS g FROM user_roms ur JOIN roms r ON r.id = ur.rom_id
       WHERE ur.user_id = ? AND (ur.playtime_seconds > 0 OR ur.last_played_at IS NOT NULL)
         AND r.genre IS NOT NULL AND r.genre <> ''`
    )
    .all(userId) as { g: string }[]) {
    for (const part of g.split(",").map((s) => s.trim()).filter(Boolean)) {
      counts.set(part, (counts.get(part) ?? 0) + 1);
    }
  }
  const topGenres = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([genre, count]) => ({ genre, count }));

  return {
    totalSeconds: agg.seconds,
    totalHours: Math.round(agg.seconds / 3600),
    gamesPlayed: agg.played,
    status,
    topGames,
    bySystem,
    topGenres,
  };
}
