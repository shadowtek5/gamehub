// The header bell's notification center. Aggregates four kinds of item into one
// per-user, unread-aware feed:
//   • update   — a newer GameHub image is published (admin only)
//   • announcement — an admin-authored post (everyone)
//   • alert    — a warn/error system event, e.g. a paused scrape (admin only)
//   • social   — someone else recently played a game (everyone)
//
// Read-state is a per-user setting (a JSON array of item keys) rather than a
// table, so there's no schema migration/restart and it stays naturally scoped
// to the user. Keys are stable per item so "mark all read" and per-item dismiss
// both work, and a changed item (new announcement, new version) reappears.

import { readFileSync } from "fs";
import path from "path";
import {
  getDb,
  getSetting,
  setSetting,
  getUserSettings,
  setUserSetting,
  listAnnouncements,
  friendIds,
  listIncomingRequests,
  recentlyAcceptedRequests,
} from "./db";
import { listEvents } from "./eventLog";
import { listUserBadges } from "./db";
import { evaluateBadges, badgeNotifKey } from "./badges";
import type { SessionUser } from "./auth";

export type NotificationType = "update" | "announcement" | "alert" | "social" | "friend" | "badge";

export interface Notification {
  /** Stable identity, e.g. "announcement:12", "alert:456", "update:0.2.0". */
  key: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** ISO timestamp used for sorting + relative-time display. */
  createdAt: string;
  /** Where clicking the item goes (internal path or external URL). */
  href?: string;
  /** True for external links (open in a new tab). */
  external?: boolean;
  severity?: "info" | "warn" | "error";
  read: boolean;
}

const READ_KEY = "notif_read";
const MAX_ITEMS = 40;

// ---------- read-state (per-user JSON set of keys) ----------

function getReadKeys(userId: number): Set<string> {
  try {
    const raw = getUserSettings(userId)[READ_KEY];
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

/** Mark keys read. `keys` omitted → nothing; used with the current feed's keys
 *  for "mark all read". Prunes to only keys that still exist so it can't grow
 *  without bound — EXCEPT badge keys: an acknowledged badge is intentionally
 *  hidden from the feed, so it's never in `validKeys`, but its read-state must
 *  persist or the badge resurfaces as unread on the very next poll. */
export function markRead(userId: number, keys: string[], validKeys: string[]): void {
  const valid = new Set(validKeys);
  const merged = new Set(
    [...getReadKeys(userId)].filter((k) => valid.has(k) || k.startsWith("badge:"))
  );
  for (const k of keys) if (valid.has(k)) merged.add(k);
  setUserSetting(userId, READ_KEY, JSON.stringify([...merged]));
}

// ---------- update check (Docker Hub tags, cached) ----------

const UPDATE_CACHE_KEY = "update_check";
const UPDATE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REPO = "shadowtek5/gamehub";

interface UpdateCache {
  latest: string | null;
  checkedAt: number;
}

/** The running app version, read from package.json at runtime (server-side). */
export function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const SEMVER = /^\d+\.\d+\.\d+$/;

/** Compare dotted semver strings; >0 if a is newer than b. */
function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

/** Newest published semver tag on Docker Hub, or null. Never throws. */
async function fetchLatestTag(repo: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(
      `https://hub.docker.com/v2/repositories/${repo}/tags?page_size=100&ordering=last_updated`,
      { signal: ctrl.signal, cache: "no-store" }
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { name: string }[] };
    const versions = (data.results ?? [])
      .map((r) => r.name)
      .filter((n) => SEMVER.test(n))
      .sort((a, b) => cmpVersion(b, a));
    return versions[0] ?? null;
  } catch {
    return null;
  }
}

/** Latest known published version, cached in settings with a 24h TTL. Refreshes
 *  in the background when stale so the notification API stays fast. Disabled by
 *  setting `update_check` = "off". */
export async function latestPublishedVersion(): Promise<string | null> {
  if (getSetting("update_check") === "off") return null;
  const repo = getSetting("update_repo") || DEFAULT_REPO;

  let cache: UpdateCache | null = null;
  try {
    const raw = getSetting(UPDATE_CACHE_KEY);
    if (raw) cache = JSON.parse(raw) as UpdateCache;
  } catch {
    cache = null;
  }

  const fresh = cache && Date.now() - cache.checkedAt < UPDATE_TTL_MS;
  if (fresh) return cache!.latest;

  const latest = await fetchLatestTag(repo);
  // Keep the last good value if this fetch failed, but still stamp the time so
  // we don't hammer Docker Hub on every request when it's down.
  const next: UpdateCache = {
    latest: latest ?? cache?.latest ?? null,
    checkedAt: Date.now(),
  };
  try {
    setSetting(UPDATE_CACHE_KEY, JSON.stringify(next));
  } catch {
    /* best-effort */
  }
  return next.latest;
}

// ---------- social: recent plays by other users ----------

interface RecentPlay {
  user_id: number;
  username: string;
  rom_id: number;
  title: string;
  last_played_at: string;
}

function recentFriendPlays(userId: number, limit: number): RecentPlay[] {
  try {
    const fids = friendIds(userId);
    if (fids.length === 0) return [];
    return getDb()
      .prepare(
        `SELECT ur.user_id,
                COALESCE(NULLIF(TRIM(u.real_name), ''), NULLIF(TRIM(u.display_name), ''), u.username) AS username,
                ur.rom_id, r.title, ur.last_played_at
           FROM user_roms ur
           JOIN users u ON u.id = ur.user_id
           JOIN roms  r ON r.id = ur.rom_id
          WHERE ur.last_played_at IS NOT NULL
            AND r.missing = 0
            AND ur.user_id IN (${fids.map(() => "?").join(",")})
          ORDER BY ur.last_played_at DESC
          LIMIT ?`
      )
      .all(...fids, limit) as RecentPlay[];
  } catch {
    return [];
  }
}

// ---------- aggregate ----------

/** Build the signed-in user's notification feed, newest-first, read-flagged. */
export async function getNotifications(user: SessionUser): Promise<Notification[]> {
  const items: Omit<Notification, "read">[] = [];

  // Award any badges the user has newly earned since the last poll. Cheap and
  // idempotent; the first run silently backfills existing progress (no burst).
  try {
    evaluateBadges(user);
  } catch {
    /* never let badge evaluation break the feed */
  }
  const read = getReadKeys(user.id);

  // Achievement badges — everyone. Only surface UNREAD badges: acknowledging one
  // clears it from the bell, but it stays on your profile forever. (Backfilled
  // badges were pre-marked read, so shipping this doesn't flood the bell.)
  for (const b of listUserBadges(user.id)) {
    const key = badgeNotifKey(b.badge_key);
    if (read.has(key)) continue;
    items.push({
      key,
      type: "badge",
      title: `New badge: ${b.name}`,
      body: b.detail,
      createdAt: b.earned_at,
      href: `/profile/${user.id}`,
    });
  }

  // Announcements — everyone.
  for (const a of listAnnouncements(true).slice(0, 20)) {
    items.push({
      key: `announcement:${a.id}`,
      type: "announcement",
      title: a.title,
      body: a.body,
      createdAt: a.created_at,
      href: "/whats-new",
    });
  }

  // Incoming friend requests — everyone. Accept them in Account › Friends.
  for (const r of listIncomingRequests(user.id)) {
    items.push({
      key: `friendreq:${r.id}`,
      type: "friend",
      title: `${r.name} sent you a friend request`,
      body: "Accept it in Account › Friends.",
      createdAt: r.since,
      href: "/account/friends",
    });
  }

  // Requests you sent that were accepted — closes the loop for the requester.
  for (const a of recentlyAcceptedRequests(user.id)) {
    items.push({
      key: `friendok:${a.id}`,
      type: "friend",
      title: `${a.name} accepted your friend request`,
      body: "You're now friends.",
      createdAt: a.since,
      href: "/account/friends",
    });
  }

  // A friend recently played — dedupe to one entry per game so a single title
  // being replayed doesn't flood the feed.
  const seenRoms = new Set<number>();
  for (const p of recentFriendPlays(user.id, 24)) {
    if (seenRoms.has(p.rom_id)) continue;
    seenRoms.add(p.rom_id);
    items.push({
      key: `played:${p.user_id}:${p.rom_id}`,
      type: "social",
      title: `${p.username} played ${p.title}`,
      createdAt: p.last_played_at,
      href: `/game/${p.rom_id}`,
    });
    if (seenRoms.size >= 8) break;
  }

  if (user.isAdmin) {
    // Operational alerts — the warn/error subset of the system event log.
    for (const e of listEvents({ severities: ["warn", "error"], limit: 20 })) {
      items.push({
        key: `alert:${e.id}`,
        type: "alert",
        title: e.summary,
        createdAt: e.created_at,
        href: "/activity",
        severity: e.severity,
      });
    }

    // A newer image is published.
    const latest = await latestPublishedVersion();
    const current = appVersion();
    if (latest && cmpVersion(latest, current) > 0) {
      items.push({
        key: `update:${latest}`,
        type: "update",
        title: `GameHub ${latest} is available`,
        body: `You're running ${current}. Pull the new image to update.`,
        createdAt: new Date().toISOString(),
        href: `https://hub.docker.com/r/${getSetting("update_repo") || DEFAULT_REPO}/tags`,
        external: true,
      });
    }
  }

  return items
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, MAX_ITEMS)
    .map((it) => ({ ...it, read: read.has(it.key) }));
}
