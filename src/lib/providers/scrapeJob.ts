// Server-side background scrape job. One at a time; survives page
// navigation (it lives in the server process, not the browser tab).

import fs from "fs";
import path from "path";
import { getDb, getHiddenSystems } from "../db";
import { scrapeOneRom } from "../scrapeOne";
import type { ScrapeProgress } from "./scrape";
import { refreshDriftedThumbs } from "../systemThumb";
import { getProviderConfig, getScraperOptions, screenscraperConfigured } from "./config";
import { ssProbeUser } from "./screenscraper";
import { getSsThreadLimit } from "./quota";
import { logEvent, lookupActor } from "../eventLog";
import { platformBySlug } from "../platforms";

/** One stuck provider must never freeze the whole job — skip after this */
const PER_GAME_TIMEOUT_MS = 180_000;

/** Small politeness gap between a worker's games (the pool bounds concurrency;
 *  this just avoids tight CDN bursts). */
const POLITE_DELAY_MS = 150;

export interface SystemProgress {
  slug: string;
  total: number;
  done: number;
}

export interface ScrapeJobStatus {
  running: boolean;
  total: number;
  done: number;
  succeeded: number;
  current: string;
  /** platform slug of the game currently being scraped ("" when idle) */
  currentSystem: string;
  /** art of the game currently being scraped (for the downloads hero) */
  currentImage: string | null;
  /** per-system progress, in processing order (for the downloads queue view) */
  systemQueue: SystemProgress[];
  errors: string[];
  startedAt: string | null;
  finishedAt: string | null;
  cancelled: boolean;
  /** Platform slugs this job is limited to; null = the whole library */
  systems: string[] | null;
  /** Number of ROMs scraped in parallel (sized to the SS thread limit). */
  concurrency: number;
  /** True when the job stopped early because a provider's daily quota ran out. */
  quotaPaused: boolean;
  /** Live sub-progress of the featured game (phase, media items, sub-op detail). */
  gameProgress: ScrapeProgress | null;
}

interface JobState extends ScrapeJobStatus {
  cancelRequested: boolean;
}

const globalJob = globalThis as unknown as { __scrapeJob?: JobState };

function state(): JobState {
  if (!globalJob.__scrapeJob) {
    globalJob.__scrapeJob = {
      running: false,
      total: 0,
      done: 0,
      succeeded: 0,
      current: "",
      currentSystem: "",
      currentImage: null,
      systemQueue: [],
      errors: [],
      startedAt: null,
      finishedAt: null,
      cancelled: false,
      systems: null,
      concurrency: 1,
      quotaPaused: false,
      gameProgress: null,
      cancelRequested: false,
    };
  }
  return globalJob.__scrapeJob;
}

export function getScrapeJobStatus(): ScrapeJobStatus {
  const s = state();
  return {
    running: s.running,
    total: s.total,
    done: s.done,
    succeeded: s.succeeded,
    current: s.current,
    currentSystem: s.currentSystem ?? "",
    currentImage: s.currentImage ?? null,
    systemQueue: s.systemQueue ?? [],
    errors: s.errors.slice(0, 25),
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    cancelled: s.cancelled,
    systems: s.systems,
    concurrency: s.concurrency ?? 1,
    quotaPaused: s.quotaPaused ?? false,
    gameProgress: s.gameProgress ?? null,
  };
}

export function cancelScrapeJob(): boolean {
  const s = state();
  if (!s.running) return false;
  s.cancelRequested = true;
  return true;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Start a background scrape over the given rom ids (ordered by platform so the
 * queue advances system-by-system). `systemQueue` carries per-system totals for
 * the downloads view. False if one is running.
 */
/** Media/scrape-state columns cleared by a full-rescrape wipe. */
const RESET_COLUMNS = [
  "boxart_url", "hero_url", "logo_url", "icon_url", "screenshot_url",
  "video_url", "manual_url", "publisher_image_url", "developer_image_url",
  "rating_image_url", "theme_url", "scraped_at", "metadata_source",
];

/** Shared WHERE for the scrape target set (missing/disc/only-missing/systems/
 *  hidden), so buildScrapeTargets + countScrapeTargets never drift. */
function scrapeWhere(onlyMissing: boolean, systems: string[] | null): { where: string; params: string[] } {
  const hidden = [...getHiddenSystems()];
  const clauses = ["missing = 0", "(disc_number IS NULL OR disc_number = 1)"];
  const params: string[] = [];
  if (onlyMissing) clauses.push("scraped_at IS NULL");
  if (systems?.length) {
    clauses.push(`platform_slug IN (${systems.map(() => "?").join(",")})`);
    params.push(...systems);
  }
  if (hidden.length) {
    clauses.push(`platform_slug NOT IN (${hidden.map(() => "?").join(",")})`);
    params.push(...hidden);
  }
  return { where: clauses.join(" AND "), params };
}

/** Cheap count of games a scrape would process — for the "Up Next" queue view. */
export function countScrapeTargets(onlyMissing: boolean, systems: string[] | null): number {
  const { where, params } = scrapeWhere(onlyMissing, systems);
  return (getDb().prepare(`SELECT COUNT(*) AS c FROM roms WHERE ${where}`).get(...params) as { c: number }).c;
}

/** Resolve which ROM ids + per-system queue a scrape should process, computed
 *  fresh at launch time (so a scan queued ahead of it is reflected). `wipe` is
 *  true for a full rescrape (not "only missing"). */
export function buildScrapeTargets(
  onlyMissing: boolean,
  systems: string[] | null
): { ids: number[]; systemQueue: SystemProgress[]; wipe: boolean } {
  const db = getDb();
  const { where, params } = scrapeWhere(onlyMissing, systems);
  const ids = (
    db.prepare(`SELECT id FROM roms WHERE ${where} ORDER BY platform_slug, sort_title`).all(...params) as {
      id: number;
    }[]
  ).map((r) => r.id);
  const systemQueue = (
    db
      .prepare(
        `SELECT platform_slug AS slug, COUNT(*) AS total FROM roms WHERE ${where}
         GROUP BY platform_slug ORDER BY platform_slug`
      )
      .all(...params) as { slug: string; total: number }[]
  ).map((r) => ({ slug: r.slug, total: r.total, done: 0 }));
  return { ids, systemQueue, wipe: !onlyMissing };
}

/** Resolve a scrape over an explicit set of ROM ids (e.g. the games a scan just
 *  added). Filters to valid, visible, non-missing, disc-1 targets and builds the
 *  per-system progress queue — so an auto-scrape of new games is scoped to
 *  exactly those games, never a whole system. */
export function buildScrapeTargetsForIds(ids: number[]): { ids: number[]; systemQueue: SystemProgress[] } {
  if (!ids.length) return { ids: [], systemQueue: [] };
  const db = getDb();
  const hidden = [...getHiddenSystems()];
  const clauses = [
    `id IN (${ids.map(() => "?").join(",")})`,
    "missing = 0",
    "(disc_number IS NULL OR disc_number = 1)",
  ];
  const params: (number | string)[] = [...ids];
  if (hidden.length) {
    clauses.push(`platform_slug NOT IN (${hidden.map(() => "?").join(",")})`);
    params.push(...hidden);
  }
  const where = clauses.join(" AND ");
  const validIds = (
    db.prepare(`SELECT id FROM roms WHERE ${where} ORDER BY platform_slug, sort_title`).all(...params) as {
      id: number;
    }[]
  ).map((r) => r.id);
  const systemQueue = (
    db
      .prepare(
        `SELECT platform_slug AS slug, COUNT(*) AS total FROM roms WHERE ${where}
         GROUP BY platform_slug ORDER BY platform_slug`
      )
      .all(...params) as { slug: string; total: number }[]
  ).map((r) => ({ slug: r.slug, total: r.total, done: 0 }));
  return { ids: validIds, systemQueue };
}

export function startScrapeJob(
  ids: number[],
  systems: string[] | null = null,
  systemQueue: SystemProgress[] = [],
  /** user who started the job — bulk-scraped games log activity as them */
  initiatedBy: number | null = null,
  /** full rescrape: wipe existing downloaded media + reset scrape state first */
  wipe = false,
  /** fires once the job settles — the queue uses it to launch the next job */
  onDone?: () => void,
  /** metadata-only backfill: fill empty metadata fields + IGDB trailer/related,
   *  download no artwork, never overwrite existing values */
  metadataOnly = false
): boolean {
  const s = state();
  if (s.running) return false;

  s.running = true;
  s.total = ids.length;
  s.done = 0;
  s.succeeded = 0;
  s.current = "";
  s.currentSystem = "";
  s.currentImage = null;
  s.systemQueue = systemQueue.map((q) => ({ slug: q.slug, total: q.total, done: 0 }));
  s.errors = [];
  s.startedAt = new Date().toISOString();
  s.finishedAt = null;
  s.cancelled = false;
  s.systems = systems;
  s.concurrency = 1;
  s.quotaPaused = false;
  s.gameProgress = null;
  s.cancelRequested = false;

  const actor = lookupActor(initiatedBy);
  const scopeLabel =
    systems && systems.length
      ? systems.length <= 3
        ? systems.map((sl) => platformBySlug(sl)?.name ?? sl).join(", ")
        : `${systems.length} systems`
      : "the whole library";
  logEvent({
    category: "scrape",
    action: "scrape.started",
    summary: `Metadata scrape started — ${ids.length} game${ids.length === 1 ? "" : "s"} (${scopeLabel})`,
    detail: { systems: systems ?? null, total: ids.length, wipe },
    actor,
  });

  void (async () => {
    const db = getDb();
    const rowOf = db.prepare(
      "SELECT title, platform_slug, hero_url, boxart_url FROM roms WHERE id = ?"
    );
    try {
      // Full rescrape: clear every targeted ROM's downloaded media + scrape
      // state up front so the run re-imports from scratch. DB reset is one
      // transaction; the on-disk media dirs are removed alongside.
      if (wipe && ids.length) {
        s.current = "Clearing existing media for re-import…";
        const reset = db.prepare(
          `UPDATE roms SET ${RESET_COLUMNS.map((c) => `${c} = NULL`).join(", ")} WHERE id = ?`
        );
        db.transaction((list: number[]) => {
          for (const id of list) reset.run(id);
        })(ids);
        const mediaRoot = path.join(process.cwd(), "data", "media");
        for (const id of ids) {
          try {
            fs.rmSync(path.join(mediaRoot, String(id)), { recursive: true, force: true });
          } catch {
            /* best-effort */
          }
        }
        s.current = "";
      }

      // Size the pool to ScreenScraper's sanctioned thread count. Probe the
      // account first so `maxthreads` (and the daily ceiling) are known before
      // any jeuInfos call — going wider than the account allows just earns
      // errors, not speed. Without SS configured, honor the user's setting as-is.
      const options = getScraperOptions();
      const config = getProviderConfig();
      const ssOn = screenscraperConfigured(config);
      if (ssOn) await ssProbeUser(config.screenscraper);
      const ceiling = ssOn ? getSsThreadLimit() : options.maxConcurrency;
      const concurrency = Math.max(1, Math.min(options.maxConcurrency, ceiling));
      s.concurrency = concurrency;

      let cursor = 0;

      // Bounded worker pool. Each worker pulls the next id off the shared cursor
      // until the queue drains or the job is cancelled. A provider that hits its
      // API cap is skipped per-game (see scrapeRom → quotaBlocked) — the job
      // keeps going on the providers that still have budget instead of halting.
      async function worker() {
        for (;;) {
          if (s.cancelRequested) {
            s.cancelled = true;
            return;
          }
          const i = cursor++;
          if (i >= ids.length) return;
          const id = ids[i];

          const row = rowOf.get(id) as
            | { title: string; platform_slug: string; hero_url: string | null; boxart_url: string | null }
            | undefined;
          // The per-system tally is keyed off this iteration's own slug, not the
          // shared s.currentSystem (another worker may have moved it on).
          const slug = row?.platform_slug ?? "";
          s.current = row?.title ?? `#${id}`;
          s.currentSystem = slug;
          s.currentImage = row?.hero_url ?? row?.boxart_url ?? null;
          try {
            // Same per-ROM work as the game page (scrapeOneRom) — scrape + log —
            // so the two never diverge.
            const { outcome } = await Promise.race([
              scrapeOneRom(id, {
                initiatedBy,
                metadataOnly,
                // Keep the featured game and its sub-progress in lock-step so the
                // downloads page shows a coherent per-game bar even at concurrency>1.
                onProgress: (p) => {
                  s.current = row?.title ?? `#${id}`;
                  s.currentSystem = slug;
                  s.gameProgress = p;
                },
              }),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("timed out after 3 minutes — skipped")),
                  PER_GAME_TIMEOUT_MS
                )
              ),
            ]);
            if (outcome.ok) {
              s.succeeded++;
            } else if (outcome.error && s.errors.length < 25) {
              s.errors.push(`${outcome.title}: ${outcome.error}`);
            }
          } catch (e) {
            if (s.errors.length < 25) {
              s.errors.push(`${s.current}: ${e instanceof Error ? e.message : e}`);
            }
          }
          s.done++;
          const sys = s.systemQueue.find((q) => q.slug === slug);
          if (sys) sys.done++;
          // Be polite to provider rate limits
          await sleep(POLITE_DELAY_MS);
        }
      }

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      s.quotaPaused = false;

      // Scraping is what fills box art — refresh any collage images whose
      // content fingerprint drifted for the systems this job touched.
      const touched = [...new Set(s.systemQueue.map((q) => q.slug))];
      if (touched.length) await refreshDriftedThumbs(touched).catch(() => {});
    } finally {
      s.running = false;
      s.current = "";
      s.currentSystem = "";
      s.currentImage = null;
      s.gameProgress = null;
      s.finishedAt = new Date().toISOString();
      const failed = s.errors.length > 0;
      logEvent({
        category: "scrape",
        action: s.cancelled ? "scrape.cancelled" : "scrape.completed",
        summary: s.cancelled
          ? `Metadata scrape cancelled — ${s.succeeded}/${s.total} scraped`
          : `Metadata scrape complete — ${s.succeeded}/${s.total} game${s.total === 1 ? "" : "s"} scraped`,
        detail: {
          total: s.total,
          done: s.done,
          succeeded: s.succeeded,
          systems: s.systems,
          errors: s.errors.slice(0, 5),
        },
        severity: s.cancelled ? "warn" : failed ? "error" : "info",
        actor,
      });
      try {
        onDone?.();
      } catch {
        /* the queue pump must never throw back into the job */
      }
    }
  })();

  return true;
}
