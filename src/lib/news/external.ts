// External ROM-hacking / translation news. Feeds are fetched server-side on a
// TTL and cached in the news_cache table, so the home page reads instantly and
// never blocks on the network. getExternalNews() returns whatever is cached and
// kicks a background refresh when the cache is stale; the Settings › News page
// can force a refresh via refreshFeeds().

import { getDb, getSetting, getNewsFeeds, isExternalNewsEnabled, NewsFeed } from "../db";
import { NewsItem } from "./types";
import { parseFeed } from "./feedParser";
import { bannerUrl } from "./banner";
import { safeFetch } from "../ssrfGuard";

/** Pick a banner motif for an image-less post from its feed label. */
function feedVariant(label: string): string {
  const l = label.toLowerCase();
  if (/(hack|patch|mod|homebrew)/.test(l)) return "romhack";
  if (/(transl|localiz|language|japanese)/.test(l)) return "translation";
  if (/(emu|core|retroarch)/.test(l)) return "emulation";
  return "community";
}

// Refresh cadence — configurable via the Automation settings (default 6h).
function refreshMs(): number {
  const h = Number(getSetting("news_interval_hours"));
  return (Number.isFinite(h) && h > 0 ? h : 6) * 60 * 60 * 1000;
}
const FETCH_TIMEOUT_MS = 12_000;
const PER_FEED = 8; // items kept per feed
const INTER_FEED_MS = 1500; // pause between feeds so hosts (e.g. reddit) don't 429 us
const UA = "GameHub/0.1 (+https://github.com/; ROM-library news reader)";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// One in-flight refresh at a time, tracked on the process global so a stampede
// of home loads doesn't fan out into dozens of concurrent fetches.
const g = globalThis as unknown as { __newsRefreshing?: boolean };

interface CacheRow {
  url: string;
  label: string | null;
  fetched_at: string | null;
  ok: number;
  error: string | null;
  items: string;
}

function readCache(): Map<string, CacheRow> {
  const rows = getDb().prepare("SELECT * FROM news_cache").all() as CacheRow[];
  return new Map(rows.map((r) => [r.url, r]));
}

function cacheIsStale(cache: Map<string, CacheRow>, feeds: NewsFeed[]): boolean {
  const now = Date.now();
  for (const f of feeds) {
    const row = cache.get(f.url);
    if (!row?.fetched_at) return true;
    if (now - Date.parse(row.fetched_at) > refreshMs()) return true;
  }
  return false;
}

async function fetchFeed(feed: NewsFeed): Promise<NewsItem[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    // safeFetch blocks feeds that resolve to private/reserved addresses (SSRF)
    // and re-checks each redirect hop — RSS feeds are public URLs by nature.
    const res = await safeFetch(feed.url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const entries = parseFeed(xml).slice(0, PER_FEED);
    const variant = feedVariant(feed.label);
    return entries.map((e, i) => ({
      id: `ext:${feed.url}:${e.link ?? i}`,
      source: "external" as const,
      category: feed.label,
      title: e.title,
      body: e.summary,
      url: e.link,
      // keep the post's own image; only synthesize a banner when it has none
      image: e.image ?? bannerUrl(variant, { kicker: feed.label }),
      date: e.date ?? new Date().toISOString(),
      accent: "#8f6fff",
    }));
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch every configured feed and write the results to news_cache. Serialized
 *  by a process-global flag; safe to call fire-and-forget. */
export async function refreshFeeds(): Promise<void> {
  if (g.__newsRefreshing) return;
  if (!isExternalNewsEnabled()) return;
  g.__newsRefreshing = true;
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO news_cache (url, label, fetched_at, ok, error, items)
     VALUES (@url, @label, @fetched_at, @ok, @error, @items)
     ON CONFLICT(url) DO UPDATE SET
       label = excluded.label, fetched_at = excluded.fetched_at,
       ok = excluded.ok, error = excluded.error, items = excluded.items`
  );
  try {
    const feeds = getNewsFeeds();
    for (let fi = 0; fi < feeds.length; fi++) {
      const feed = feeds[fi];
      if (fi > 0) await sleep(INTER_FEED_MS);
      const fetched_at = new Date().toISOString();
      try {
        const items = await fetchFeed(feed);
        upsert.run({ url: feed.url, label: feed.label, fetched_at, ok: 1, error: null, items: JSON.stringify(items) });
      } catch (e) {
        // keep any previously cached items; just record the error + stamp so we
        // don't hammer a broken feed every load
        const prev = (db.prepare("SELECT items FROM news_cache WHERE url = ?").get(feed.url) as { items: string } | undefined)?.items ?? "[]";
        upsert.run({
          url: feed.url,
          label: feed.label,
          fetched_at,
          ok: 0,
          error: e instanceof Error ? e.message : String(e),
          items: prev,
        });
      }
    }
    // drop cache rows for feeds no longer configured
    const keep = getNewsFeeds().map((f) => f.url);
    const all = db.prepare("SELECT url FROM news_cache").all() as { url: string }[];
    for (const { url } of all) if (!keep.includes(url)) db.prepare("DELETE FROM news_cache WHERE url = ?").run(url);
  } finally {
    g.__newsRefreshing = false;
  }
}

/** Cached external items, newest first. Triggers a background refresh when the
 *  cache is missing or stale (never awaited — the current render uses what's
 *  cached and the next one picks up fresh data). */
export function getExternalNews(limit = 8): NewsItem[] {
  if (!isExternalNewsEnabled()) return [];
  const feeds = getNewsFeeds();
  const cache = readCache();

  if (cacheIsStale(cache, feeds)) void refreshFeeds().catch(() => {});

  const items: NewsItem[] = [];
  for (const f of feeds) {
    const row = cache.get(f.url);
    if (!row?.items) continue;
    try {
      items.push(...(JSON.parse(row.items) as NewsItem[]));
    } catch {
      /* ignore a corrupt cache row */
    }
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  return items.slice(0, limit);
}

export interface FeedStatus {
  url: string;
  label: string;
  fetched_at: string | null;
  ok: boolean;
  error: string | null;
  count: number;
}

/** Per-feed health for the Settings page. */
export function getFeedStatuses(): FeedStatus[] {
  const cache = readCache();
  return getNewsFeeds().map((f) => {
    const row = cache.get(f.url);
    let count = 0;
    try {
      count = row ? (JSON.parse(row.items) as unknown[]).length : 0;
    } catch {
      count = 0;
    }
    return {
      url: f.url,
      label: f.label,
      fetched_at: row?.fetched_at ?? null,
      ok: !!row?.ok,
      error: row?.error ?? null,
      count,
    };
  });
}
