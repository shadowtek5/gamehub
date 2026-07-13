// User profiles, Steam-style: badges earned from real library activity grant
// XP, XP determines the level shown in the profile's level ring.

import { getDb, UserRow, friendIds } from "./db";

export interface ProfileStats {
  games: number; // total library size (shared) — only used for admin library milestones
  played: number;
  beaten: number;
  favorites: number;
  collections: number;
  saveStates: number;
  hours: number;
  years: number;
  perfect: number; // games at 100% completion
  rated: number; // games given a personal rating
  noted: number; // games with personal notes
  dropped: number; // games marked dropped
  systemsPlayed: number; // distinct platforms the user has played
  friends: number; // accepted friends
  commentsReceived: number; // comments left on this user's profile
}

export interface ProfileBadge {
  key: string;
  name: string;
  detail: string;
  xp: number;
  /** Emoji, or a plain number (years of service) rendered like Steam's badge */
  icon: string;
  color: string;
  /** Art variant for the generated badge image (What's New style). */
  art?: string;
  /** Badge family (tiers collapse to one tile per family in the grid). */
  family?: string;
}

export const PROFILE_THEMES: Record<string, { name: string; from: string; to: string }> = {
  default: { name: "Default Theme", from: "#1f2c3d", to: "#12161d" },
  summer: { name: "Summer", from: "#8a6510", to: "#1a150a" },
  midnight: { name: "Midnight", from: "#0b0e17", to: "#04050a" },
};

export function getProfileUser(id: number): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function profileName(u: UserRow): string {
  return u.display_name?.trim() || u.username;
}

export function profileStats(userId: number): ProfileStats {
  const db = getDb();
  const games = (db.prepare("SELECT COUNT(*) AS c FROM roms WHERE missing = 0").get() as { c: number }).c;
  const ur = db
    .prepare(
      `SELECT COUNT(CASE WHEN playtime_seconds > 0 OR last_played_at IS NOT NULL THEN 1 END) AS played,
              COUNT(CASE WHEN play_status = 'beaten' THEN 1 END) AS beaten,
              COUNT(CASE WHEN favorite = 1 THEN 1 END) AS favorites,
              COUNT(CASE WHEN completion >= 100 THEN 1 END) AS perfect,
              COUNT(CASE WHEN user_rating IS NOT NULL THEN 1 END) AS rated,
              COUNT(CASE WHEN notes IS NOT NULL AND TRIM(notes) <> '' THEN 1 END) AS noted,
              COUNT(CASE WHEN play_status = 'dropped' THEN 1 END) AS dropped,
              COALESCE(SUM(playtime_seconds), 0) AS seconds
       FROM user_roms WHERE user_id = ?`
    )
    .get(userId) as {
    played: number;
    beaten: number;
    favorites: number;
    perfect: number;
    rated: number;
    noted: number;
    dropped: number;
    seconds: number;
  };
  const systemsPlayed = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT r.platform_slug) AS c
           FROM user_roms ur JOIN roms r ON r.id = ur.rom_id
          WHERE ur.user_id = ? AND (ur.playtime_seconds > 0 OR ur.last_played_at IS NOT NULL)`
      )
      .get(userId) as { c: number }
  ).c;
  const commentsReceived = (
    db.prepare("SELECT COUNT(*) AS c FROM profile_comments WHERE profile_user_id = ?").get(userId) as {
      c: number;
    }
  ).c;
  const collections = (
    db.prepare("SELECT COUNT(*) AS c FROM collections WHERE user_id = ?").get(userId) as { c: number }
  ).c;
  const saveStates = (
    db.prepare("SELECT COUNT(*) AS c FROM save_states WHERE user_id = ?").get(userId) as { c: number }
  ).c;
  const created = (
    db.prepare("SELECT created_at FROM users WHERE id = ?").get(userId) as
      | { created_at: string }
      | undefined
  )?.created_at;
  const years = created
    ? Math.floor((Date.now() - new Date(created + "Z").getTime()) / (365.25 * 24 * 3600 * 1000))
    : 0;
  return {
    games,
    played: ur.played,
    beaten: ur.beaten,
    favorites: ur.favorites,
    collections,
    saveStates,
    hours: Math.floor(ur.seconds / 3600),
    years: Math.max(0, years),
    perfect: ur.perfect,
    rated: ur.rated,
    noted: ur.noted,
    dropped: ur.dropped,
    systemsPlayed,
    friends: friendIds(userId).length,
    commentsReceived,
  };
}

/** Steam's level curve: each block of 10 levels costs 100 XP more per level */
export function levelFromXp(xp: number): number {
  let level = 0;
  let remaining = xp;
  let block = 0;
  // 5000 is far beyond any reachable XP; guards against infinite loops
  while (level < 5000) {
    const cost = 100 * (block + 1);
    for (let i = 0; i < 10; i++) {
      if (remaining < cost) return level;
      remaining -= cost;
      level++;
    }
    block++;
  }
  return level;
}

export function totalXp(badges: ProfileBadge[]): number {
  return badges.reduce((sum, b) => sum + b.xp, 0);
}

/** Hero images from the user's favorites and most-played games, for the
 *  profile-background picker (plus recently scraped heroes as filler). */
export function backgroundCandidates(userId: number, limit = 24): { url: string; title: string }[] {
  const db = getDb();
  const personal = db
    .prepare(
      `SELECT r.hero_url AS url, r.title FROM user_roms ur
       JOIN roms r ON r.id = ur.rom_id
       WHERE ur.user_id = ? AND r.hero_url IS NOT NULL AND r.missing = 0
       ORDER BY ur.favorite DESC, ur.playtime_seconds DESC, ur.last_played_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as { url: string; title: string }[];
  const filler = db
    .prepare(
      `SELECT hero_url AS url, title FROM roms
       WHERE hero_url IS NOT NULL AND missing = 0
       ORDER BY scraped_at DESC LIMIT ?`
    )
    .all(limit) as { url: string; title: string }[];
  const seen = new Set<string>();
  const out: { url: string; title: string }[] = [];
  for (const c of [...personal, ...filler]) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/** Paginated + searchable hero-art picker source: every non-missing game with
 *  hero art, the caller's favorites / most-played first, then by title. Backs
 *  the profile-background picker's infinite scroll + name search. Returns one
 *  extra row beyond `limit` so the caller can tell whether more remain. */
export function searchBackgrounds(
  userId: number,
  q: string,
  offset: number,
  limit = 30
): { items: { url: string; title: string }[]; hasMore: boolean } {
  const db = getDb();
  const term = q.trim();
  const like = term ? `%${term.replace(/[\\%_]/g, "\\$&")}%` : null;
  const rows = db
    .prepare(
      `SELECT r.hero_url AS url, r.title
       FROM roms r
       LEFT JOIN user_roms ur ON ur.rom_id = r.id AND ur.user_id = ?
       WHERE r.hero_url IS NOT NULL AND r.missing = 0
       ${like ? "AND r.title LIKE ? ESCAPE '\\'" : ""}
       ORDER BY COALESCE(ur.favorite, 0) DESC,
                COALESCE(ur.playtime_seconds, 0) DESC,
                r.title COLLATE NOCASE ASC, r.id ASC
       LIMIT ? OFFSET ?`
    )
    .all(...(like ? [userId, like, limit + 1, offset] : [userId, limit + 1, offset])) as {
    url: string;
    title: string;
  }[];
  const hasMore = rows.length > limit;
  return { items: rows.slice(0, limit), hasMore };
}

export interface ProfileCommentRow {
  id: number;
  author_id: number;
  body: string;
  created_at: string;
  author_name: string;
  author_display: string | null;
  author_avatar: string | null;
}

export function profileComments(profileUserId: number): ProfileCommentRow[] {
  return getDb()
    .prepare(
      `SELECT c.id, c.author_id, c.body, c.created_at,
              u.username AS author_name, u.display_name AS author_display,
              u.avatar_url AS author_avatar
       FROM profile_comments c JOIN users u ON u.id = c.author_id
       WHERE c.profile_user_id = ?
       ORDER BY c.created_at DESC, c.id DESC LIMIT 50`
    )
    .all(profileUserId) as ProfileCommentRow[];
}
