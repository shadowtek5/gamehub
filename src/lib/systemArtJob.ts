// Server-side background job that re-scrapes system (per-console) art across the
// whole library. One at a time; lives in the server process so it survives page
// navigation. Mirrors hashJob / scrapeJob.

import { getDb } from "./db";
import { scrapeSystemArt } from "./systemArt";

export interface SystemArtJobStatus {
  running: boolean;
  total: number;
  done: number;
  /** systems that got at least one piece of art this run */
  updated: number;
  /** slug of the system currently being scraped ("" when idle) */
  current: string;
  errors: string[];
  startedAt: string | null;
  finishedAt: string | null;
  cancelled: boolean;
}

interface JobState extends SystemArtJobStatus {
  cancelRequested: boolean;
}

const globalJob = globalThis as unknown as { __systemArtJob?: JobState };

function state(): JobState {
  if (!globalJob.__systemArtJob) {
    globalJob.__systemArtJob = {
      running: false,
      total: 0,
      done: 0,
      updated: 0,
      current: "",
      errors: [],
      startedAt: null,
      finishedAt: null,
      cancelled: false,
      cancelRequested: false,
    };
  }
  return globalJob.__systemArtJob;
}

export function getSystemArtJobStatus(): SystemArtJobStatus {
  const s = state();
  return {
    running: s.running,
    total: s.total,
    done: s.done,
    updated: s.updated,
    current: s.current,
    errors: s.errors.slice(0, 25),
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    cancelled: s.cancelled,
  };
}

export function cancelSystemArtJob(): boolean {
  const s = state();
  if (!s.running) return false;
  s.cancelRequested = true;
  return true;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Systems that have at least one game in the library — the browsable set. */
function systemsWithGames(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT r.platform_slug AS slug
         FROM roms r
         JOIN systems s ON s.slug = r.platform_slug
        WHERE r.missing = 0
        ORDER BY s.name`
    )
    .all() as { slug: string }[];
  return rows.map((r) => r.slug);
}

/**
 * Re-scrape system art in the background. Force re-fetches every piece so
 * previously-scraped systems pick up the current provider/type mapping. Scoped
 * to systems that have games in the library. False if one is already running.
 */
export function startSystemArtJob(systems?: string[], onComplete?: () => void): boolean {
  const s = state();
  if (s.running) {
    onComplete?.();
    return false;
  }

  const only = systems?.length ? new Set(systems) : null;
  const slugs = systemsWithGames().filter((slug) => !only || only.has(slug));
  s.running = true;
  s.total = slugs.length;
  s.done = 0;
  s.updated = 0;
  s.current = "";
  s.errors = [];
  s.startedAt = new Date().toISOString();
  s.finishedAt = null;
  s.cancelled = false;
  s.cancelRequested = false;

  void (async () => {
    try {
      for (const slug of slugs) {
        if (s.cancelRequested) {
          s.cancelled = true;
          break;
        }
        s.current = slug;
        try {
          const { got } = await scrapeSystemArt(slug, true);
          if (got.length) s.updated++;
        } catch (e) {
          if (s.errors.length < 25) {
            s.errors.push(`${slug}: ${e instanceof Error ? e.message : e}`);
          }
        }
        s.done++;
        // Be polite to provider rate limits between systems.
        await sleep(400);
      }
    } finally {
      s.running = false;
      s.current = "";
      s.finishedAt = new Date().toISOString();
      onComplete?.();
    }
  })();

  return true;
}
