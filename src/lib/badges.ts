// Achievement badges: a catalog of tiered, per-user badges earned from real
// library activity. Unlike the old on-the-fly computation, earned badges are
// PERSISTED (see user_badges) the moment they're reached, which is what lets us
// (a) notify "you earned a badge" and (b) award XP for what the user actually did.
//
// Each family (marathon, completion, …) has ascending tiers; every tier is its
// own badge_key ("marathon:100h") so climbing a tier awards a new badge. Lower
// tiers stay earned. XP is the sum of all earned tiers.
//
// Personal badges are per-user. The "library" family (total library size) is a
// shared milestone and is only awarded to admins — regular users get badges for
// their own play, not the size of the shared collection.

import { ProfileStats, ProfileBadge, profileStats, levelFromXp } from "./profile";
import {
  EarnedBadgeRow,
  insertUserBadges,
  earnedBadgeKeys,
  listUserBadges,
  getUserSettings,
  setUserSetting,
} from "./db";

export interface BadgeDef {
  badge_key: string;
  family: string;
  name: string;
  detail: string;
  xp: number;
  icon: string;
  color: string;
  art: string;
  tier: number;
}

interface Tier {
  min: number;
  id: string; // key suffix, e.g. "100h"
  name: string;
  xp: number;
}

interface Family {
  family: string;
  icon: string;
  color: string;
  art: string; // art variant for the generated badge image (see badgeArt.ts)
  value: (s: ProfileStats) => number;
  detail: (v: number) => string; // snapshotted at earn time
  tiers: Tier[];
  adminOnly?: boolean;
}

const plural = (n: number, w: string) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------------------
// The catalog. Colors follow the badge's mood; `art` maps to an illustration in
// badgeArt.ts drawn in the What's New banner style.
// ---------------------------------------------------------------------------

const FAMILIES: Family[] = [
  // ---- Play & completion ----
  {
    family: "marathon",
    icon: "⏱",
    color: "#2f6a8c",
    art: "playtime",
    value: (s) => s.hours,
    detail: (v) => `${plural(v, "hour")} played`,
    tiers: [
      { min: 1, id: "1h", name: "Warming Up", xp: 50 },
      { min: 10, id: "10h", name: "Power Player", xp: 100 },
      { min: 50, id: "50h", name: "Dedicated", xp: 200 },
      { min: 100, id: "100h", name: "Marathon Runner", xp: 300 },
      { min: 500, id: "500h", name: "Legendary Grinder", xp: 500 },
      { min: 1000, id: "1000h", name: "Time Lord", xp: 750 },
    ],
  },
  {
    family: "explorer",
    icon: "🎮",
    color: "#8c2f2f",
    art: "played",
    value: (s) => s.played,
    detail: (v) => `Played ${plural(v, "game")}`,
    tiers: [
      { min: 10, id: "10", name: "Dabbler", xp: 50 },
      { min: 50, id: "50", name: "Enthusiast", xp: 150 },
      { min: 250, id: "250", name: "Devotee", xp: 300 },
      { min: 1000, id: "1000", name: "Completionaut", xp: 500 },
    ],
  },
  {
    family: "completion",
    icon: "🏆",
    color: "#8a6d1f",
    art: "completion",
    value: (s) => s.beaten,
    detail: (v) => `${plural(v, "game")} beaten`,
    tiers: [
      { min: 1, id: "1", name: "First Victory", xp: 100 },
      { min: 10, id: "10", name: "Finisher", xp: 300 },
      { min: 50, id: "50", name: "Completionist", xp: 500 },
      { min: 100, id: "100", name: "Conqueror", xp: 750 },
    ],
  },
  {
    family: "perfect",
    icon: "💯",
    color: "#b8892f",
    art: "completion",
    value: (s) => s.perfect,
    detail: (v) => `${plural(v, "game")} at 100%`,
    tiers: [
      { min: 1, id: "1", name: "Perfect Run", xp: 150 },
      { min: 10, id: "10", name: "Perfectionist", xp: 400 },
      { min: 25, id: "25", name: "Flawless", xp: 600 },
    ],
  },
  {
    family: "dropped",
    icon: "🥀",
    color: "#6a4b5a",
    art: "played",
    value: (s) => s.dropped,
    detail: (v) => `${plural(v, "game")} dropped`,
    tiers: [
      { min: 10, id: "10", name: "Moving On", xp: 50 },
      { min: 50, id: "50", name: "Ruthless Curator", xp: 150 },
    ],
  },

  // ---- Collection & curation ----
  {
    family: "devoted",
    icon: "❤",
    color: "#7a2f4b",
    art: "collection",
    value: (s) => s.favorites,
    detail: (v) => plural(v, "favorite"),
    tiers: [
      { min: 10, id: "10", name: "Devoted Fan", xp: 100 },
      { min: 50, id: "50", name: "Superfan", xp: 250 },
      { min: 100, id: "100", name: "Obsessed", xp: 500 },
    ],
  },
  {
    family: "curator",
    icon: "🗂",
    color: "#3d7a4b",
    art: "collection",
    value: (s) => s.collections,
    detail: (v) => `${plural(v, "collection")} created`,
    tiers: [
      { min: 1, id: "1", name: "Tastemaker", xp: 50 },
      { min: 5, id: "5", name: "Gallery Curator", xp: 150 },
      { min: 10, id: "10", name: "Master Curator", xp: 300 },
      { min: 25, id: "25", name: "Grand Archivist", xp: 500 },
    ],
  },
  {
    family: "critic",
    icon: "⭐",
    color: "#8a6d1f",
    art: "curation",
    value: (s) => s.rated,
    detail: (v) => `Rated ${plural(v, "game")}`,
    tiers: [
      { min: 10, id: "10", name: "Critic", xp: 100 },
      { min: 50, id: "50", name: "Reviewer", xp: 250 },
      { min: 100, id: "100", name: "Chief Critic", xp: 400 },
    ],
  },
  {
    family: "journaler",
    icon: "📝",
    color: "#4b5a7a",
    art: "curation",
    value: (s) => s.noted,
    detail: (v) => `Wrote notes on ${plural(v, "game")}`,
    tiers: [
      { min: 5, id: "5", name: "Note Taker", xp: 100 },
      { min: 25, id: "25", name: "Chronicler", xp: 250 },
    ],
  },
  {
    family: "timetraveler",
    icon: "⏳",
    color: "#5a3a7a",
    art: "saves",
    value: (s) => s.saveStates,
    detail: (v) => `${plural(v, "save state")} stored`,
    tiers: [
      { min: 5, id: "5", name: "Time Traveler", xp: 100 },
      { min: 25, id: "25", name: "Chrono Keeper", xp: 250 },
      { min: 100, id: "100", name: "Save Scummer", xp: 400 },
    ],
  },

  // ---- Breadth / exploration ----
  {
    family: "globetrotter",
    icon: "🌐",
    color: "#2f7a7a",
    art: "breadth",
    value: (s) => s.systemsPlayed,
    detail: (v) => `Played across ${plural(v, "system")}`,
    tiers: [
      { min: 3, id: "3", name: "Platform Hopper", xp: 100 },
      { min: 8, id: "8", name: "Globetrotter", xp: 250 },
      { min: 15, id: "15", name: "Polyglot Gamer", xp: 400 },
      { min: 25, id: "25", name: "Omnivore", xp: 600 },
    ],
  },

  // ---- Social & loyalty ----
  {
    family: "friends",
    icon: "🤝",
    color: "#3a6ea5",
    art: "social",
    value: (s) => s.friends,
    detail: (v) => plural(v, "friend"),
    tiers: [
      { min: 1, id: "1", name: "Made a Friend", xp: 50 },
      { min: 5, id: "5", name: "Well Connected", xp: 100 },
      { min: 10, id: "10", name: "Social Butterfly", xp: 200 },
      { min: 25, id: "25", name: "Community Pillar", xp: 300 },
    ],
  },
  {
    family: "popular",
    icon: "💬",
    color: "#7a4b7a",
    art: "social",
    value: (s) => s.commentsReceived,
    detail: (v) => `${plural(v, "profile comment")} received`,
    tiers: [
      { min: 1, id: "1", name: "Noticed", xp: 50 },
      { min: 10, id: "10", name: "Popular", xp: 150 },
      { min: 50, id: "50", name: "Community Favorite", xp: 300 },
    ],
  },
  {
    family: "years",
    icon: "🎖",
    color: "#4b3a7a",
    art: "loyalty",
    value: (s) => s.years,
    detail: (v) => `Member for ${plural(v, "year")}`,
    tiers: [
      { min: 1, id: "1y", name: "One-Year Veteran", xp: 50 },
      { min: 3, id: "3y", name: "Three-Year Regular", xp: 100 },
      { min: 5, id: "5y", name: "Five-Year Veteran", xp: 150 },
      { min: 10, id: "10y", name: "Decade of Play", xp: 300 },
    ],
  },

  // ---- Library milestones (admins only — shared collection, not personal) ----
  {
    family: "library",
    icon: "📚",
    color: "#5a4a2f",
    art: "library",
    adminOnly: true,
    value: (s) => s.games,
    detail: (v) => `${plural(v, "game")} in the library`,
    tiers: [
      { min: 100, id: "100", name: "Librarian", xp: 100 },
      { min: 1000, id: "1k", name: "Archivist", xp: 200 },
      { min: 10000, id: "10k", name: "Curator of History", xp: 300 },
      { min: 50000, id: "50k", name: "Game Industry Guardian", xp: 500 },
    ],
  },
];

/** The flat, always-earned membership badge. */
const CHARTER: BadgeDef = {
  badge_key: "member",
  family: "member",
  name: "Charter Member",
  detail: "Joined the GameHub community",
  xp: 100,
  icon: "🎖",
  color: "#3a4c63",
  art: "loyalty",
  tier: 0,
};

/** Every badge the user currently qualifies for (all reached tiers), with detail
 *  snapshotted from the live stat value. */
export function computeBadges(stats: ProfileStats, isAdmin: boolean): BadgeDef[] {
  const out: BadgeDef[] = [CHARTER];
  for (const fam of FAMILIES) {
    if (fam.adminOnly && !isAdmin) continue;
    const v = fam.value(stats);
    fam.tiers.forEach((t, i) => {
      if (v >= t.min) {
        out.push({
          badge_key: `${fam.family}:${t.id}`,
          family: fam.family,
          name: t.name,
          detail: fam.detail(v),
          xp: t.xp,
          icon: fam.icon,
          color: fam.color,
          art: fam.art,
          tier: i,
        });
      }
    });
  }
  return out;
}

/** Stable notification key for an earned badge. */
export function badgeNotifKey(badgeKey: string): string {
  return `badge:${badgeKey}`;
}

function toProfileBadge(r: EarnedBadgeRow): ProfileBadge {
  return {
    key: r.badge_key,
    name: r.name,
    detail: r.detail,
    xp: r.xp,
    icon: r.icon,
    color: r.color,
    art: r.art,
    family: r.family,
  };
}

export interface ProfileBadgeView {
  /** One tile per family (highest earned tier), highest XP first. */
  badges: ProfileBadge[];
  /** Every earned tier, newest first (for a full "all badges" list). */
  earned: ProfileBadge[];
  xp: number; // sum of ALL earned tiers
  level: number;
  count: number; // total earned tiers
}

/**
 * Display-ready badges for a profile, read from the persisted store (no side
 * effects — call evaluateBadges elsewhere to award). The grid collapses tiers to
 * the highest per family; XP counts every earned tier so climbing tiers adds up.
 */
export function profileBadges(userId: number): ProfileBadgeView {
  const earned = listUserBadges(userId);
  const xp = earned.reduce((s, b) => s + b.xp, 0);
  const byFamily = new Map<string, EarnedBadgeRow>();
  for (const b of earned) {
    const cur = byFamily.get(b.family);
    if (!cur || b.tier > cur.tier) byFamily.set(b.family, b);
  }
  const badges = [...byFamily.values()].map(toProfileBadge).sort((a, b) => b.xp - a.xp);
  return { badges, earned: earned.map(toProfileBadge), xp, level: levelFromXp(xp), count: earned.length };
}

const INIT_KEY = "badges_init";
const READ_KEY = "notif_read";

/**
 * Evaluate the user's badges and persist any newly earned ones. Returns the rows
 * inserted this call. On a user's FIRST-ever evaluation we silently backfill
 * everything they already qualify for (marking those notifications pre-read) so
 * shipping this doesn't spam the bell — only badges earned afterwards notify.
 * Cheap and idempotent: safe to call on every notification poll / profile view.
 */
export function evaluateBadges(user: { id: number; isAdmin: boolean }): EarnedBadgeRow[] {
  const already = earnedBadgeKeys(user.id);
  const qualifying = computeBadges(profileStats(user.id), user.isAdmin);
  const toInsert = qualifying.filter((b) => !already.has(b.badge_key));
  if (toInsert.length === 0) {
    // Still stamp the init marker the first time so a fresh account that qualifies
    // for nothing yet doesn't later get a retro-burst.
    ensureInit(user.id);
    return [];
  }
  const inserted = insertUserBadges(user.id, toInsert);
  const firstRun = !getUserSettings(user.id)[INIT_KEY];
  if (firstRun) {
    // Silent backfill: pre-mark these as read so no burst appears in the bell.
    const settings = getUserSettings(user.id);
    const read = parseKeys(settings[READ_KEY]);
    for (const b of inserted) read.add(badgeNotifKey(b.badge_key));
    setUserSetting(user.id, READ_KEY, JSON.stringify([...read]));
    setUserSetting(user.id, INIT_KEY, new Date().toISOString());
    return []; // nothing to actively notify on the first run
  }
  return inserted;
}

function ensureInit(userId: number) {
  if (!getUserSettings(userId)[INIT_KEY]) setUserSetting(userId, INIT_KEY, new Date().toISOString());
}

function parseKeys(raw: string | undefined): Set<string> {
  try {
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}
