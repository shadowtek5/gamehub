// Server-side background library scan. Runs one system at a time so the queue
// advances system-by-system (mirrors the scrape job). Survives navigation —
// it lives in the server process, not the browser tab.

import { getDb, getSystemFolders, getHiddenSystems, getSetting } from "./db";
import { scanLibrary } from "./scanner";
import { runCleanup } from "./cleanup";
import { refreshDriftedThumbs } from "./systemThumb";
import { hashRoms } from "./hashJob";
import { FOLDER_ROM_SLUGS } from "./platforms";
import { getScraperOptions } from "./providers/config";
import { logEvent } from "./eventLog";
import { platformBySlug } from "./platforms";
import type { SystemProgress } from "./providers/scrapeJob";

export interface ScanJobStatus {
  running: boolean;
  total: number; // systems to scan
  done: number; // systems finished
  currentSystem: string;
  systemQueue: SystemProgress[]; // per-system: total 1, done 0|1
  scanned: number;
  added: number;
  updated: number;
  /** Rows repointed to a renamed/moved file (scraped data carried over) */
  moved: number;
  markedMissing: number;
  /** ROMs whose file hashes (CRC32/MD5/SHA1) were computed during this scan */
  hashed: number;
  errors: string[];
  startedAt: string | null;
  finishedAt: string | null;
  cancelled: boolean;
  /** True during post-loop finalization (regenerating collage art) after every
   *  system has been scanned — so the UI shows "Finishing up…" instead of a
   *  frozen "Scanning files" at 100%. */
  finalizing: boolean;
}

interface JobState extends ScanJobStatus {
  cancelRequested: boolean;
  /** Who triggered this scan (for the Activity Log); null = automatic. */
  actor: { id: number; name: string } | null;
  /** Row ids of games this scan newly added — kept off ScanJobStatus (and thus
   *  the /api/jobs payload) so a big scan doesn't bloat every poll. Read via
   *  getLastScanAddedIds() to auto-scrape just the new games. */
  addedIds: number[];
}

const globalJob = globalThis as unknown as { __scanJob?: JobState };

function state(): JobState {
  if (!globalJob.__scanJob) {
    globalJob.__scanJob = {
      running: false,
      total: 0,
      done: 0,
      currentSystem: "",
      systemQueue: [],
      scanned: 0,
      added: 0,
      updated: 0,
      moved: 0,
      markedMissing: 0,
      hashed: 0,
      errors: [],
      startedAt: null,
      finishedAt: null,
      cancelled: false,
      finalizing: false,
      cancelRequested: false,
      actor: null,
      addedIds: [],
    };
  }
  return globalJob.__scanJob;
}

/** Row ids of games the most recent scan newly added (empty if none). Used by the
 *  job queue to auto-scrape just the new games after a watcher-triggered scan. */
export function getLastScanAddedIds(): number[] {
  return state().addedIds;
}

export function getScanJobStatus(): ScanJobStatus {
  const s = state();
  return {
    running: s.running,
    total: s.total,
    done: s.done,
    currentSystem: s.currentSystem,
    systemQueue: s.systemQueue,
    scanned: s.scanned,
    added: s.added,
    updated: s.updated,
    moved: s.moved,
    markedMissing: s.markedMissing,
    hashed: s.hashed,
    errors: s.errors.slice(0, 25),
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    cancelled: s.cancelled,
    finalizing: s.finalizing,
  };
}

export function cancelScanJob(): boolean {
  const s = state();
  if (!s.running) return false;
  s.cancelRequested = true;
  return true;
}

/** Resolve which systems a full scan should iterate (configured, non-hidden). */
function scanSystems(requested: string[] | null): string[] {
  if (requested?.length) return requested;
  const hidden = getHiddenSystems();
  const configured = [...new Set(getSystemFolders().map((f) => f.platform_slug))];
  return configured.filter((s) => !hidden.has(s));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Hash ROMs that still lack file hashes (scoped to a system, or the whole
 *  library when slug is undefined). Only unhashed rows are touched, so this is
 *  cheap on a re-scan — it just hashes whatever still needs it. Skips oversized
 *  files (same cap as the standalone hash job) and honors cancel. */
async function hashUnhashed(s: JobState, slug: string | undefined): Promise<void> {
  const db = getDb();
  const plat = slug ? " AND platform_slug = ?" : "";
  // Folder-based ROMs (Wii U, …) are directories, not streamable files — exclude.
  const folderExcl = FOLDER_ROM_SLUGS.length
    ? ` AND platform_slug NOT IN (${FOLDER_ROM_SLUGS.map(() => "?").join(",")})`
    : "";
  const rows = db
    .prepare(
      `SELECT id, path, size_bytes FROM roms
       WHERE missing = 0 AND md5 IS NULL${plat}${folderExcl} ORDER BY size_bytes`
    )
    .all(...(slug ? [slug] : []), ...FOLDER_ROM_SLUGS) as {
    id: number;
    path: string;
    size_bytes: number;
  }[];
  if (rows.length === 0) return;
  // Parallel pool (I/O overlap) — much faster over the whole library than the
  // old one-file-at-a-time loop. Unreadable files are skipped and retried next
  // scan (they stay md5 IS NULL).
  await hashRoms(rows, {
    isCancelled: () => s.cancelRequested,
    onHashed: () => {
      s.hashed++;
    },
  });
}

/** Start a background scan. `systems` null = every configured system.
 *  `onDone` fires once the job settles (success/cancel/error) — the job queue
 *  uses it to launch whatever is waiting next. */
export function startScanJob(
  systems: string[] | null = null,
  onDone?: () => void,
  actor: { id: number; name: string } | null = null
): boolean {
  const s = state();
  if (s.running) return false;

  const list = scanSystems(systems);

  s.running = true;
  s.total = list.length || 1;
  s.done = 0;
  s.currentSystem = "";
  s.systemQueue = list.map((slug) => ({ slug, total: 1, done: 0 }));
  s.scanned = 0;
  s.added = 0;
  s.updated = 0;
  s.moved = 0;
  s.markedMissing = 0;
  s.hashed = 0;
  s.addedIds = [];
  s.errors = [];
  s.startedAt = new Date().toISOString();
  s.finishedAt = null;
  s.cancelled = false;
  s.finalizing = false;
  s.cancelRequested = false;
  s.actor = actor;

  logEvent({
    category: "scan",
    action: "scan.started",
    summary: list.length
      ? `Library scan started (${list.length} system${list.length === 1 ? "" : "s"})`
      : "Library scan started",
    detail: { systems: list },
    actor,
  });

  void (async () => {
    // Systems this run touched (for scoped thumbnail regeneration) and whether
    // a whole-library pass ran (then we regenerate every stale thumbnail).
    const scannedSlugs: string[] = [];
    let wholeLibrary = false;
    try {
      // No configured folders resolved → one whole-library pass.
      const targets = list.length ? list : [null];
      for (const slug of targets) {
        if (s.cancelRequested) {
          s.cancelled = true;
          break;
        }
        s.currentSystem = slug ?? "";
        try {
          const r = scanLibrary({ systems: slug ? [slug] : undefined });
          s.scanned += r.scanned;
          s.added += r.added;
          s.updated += r.updated;
          s.moved += r.moved;
          s.markedMissing += r.markedMissing;
          s.addedIds.push(...r.addedIds);
          if (r.errors.length && s.errors.length < 25) s.errors.push(...r.errors.slice(0, 5));
          const scope = slug ? platformBySlug(slug)?.name ?? slug : "the library";
          if (r.added > 0) {
            logEvent({
              category: "scan",
              action: "scan.new_games",
              summary: `Found ${r.added} new game${r.added === 1 ? "" : "s"} in ${scope}`,
              detail: { slug: slug ?? null, count: r.added, titles: r.addedTitles },
              actor: s.actor,
            });
          }
          if (r.markedMissing > 0) {
            logEvent({
              category: "scan",
              action: "scan.games_removed",
              summary: `${r.markedMissing} game${r.markedMissing === 1 ? "" : "s"} no longer on disk in ${scope}`,
              detail: { slug: slug ?? null, count: r.markedMissing, titles: r.removedTitles },
              severity: "warn",
              actor: s.actor,
            });
          }
          if (getSetting("auto_cleanup") === "on" && r.markedMissing > 0) {
            runCleanup(slug ? [slug] : []);
          }
          if (slug) {
            scannedSlugs.push(slug);
          } else {
            wholeLibrary = true;
          }
          // Compute file hashes for anything the scan just added (enables exact
          // Hasheous / dat-db matching). Only unhashed rows, size-capped, so a
          // re-scan barely does any work. Gated by the hash-matching option.
          if (getScraperOptions().hashMatching && !s.cancelRequested) {
            await hashUnhashed(s, slug ?? undefined);
          }
        } catch (e) {
          if (s.errors.length < 25) s.errors.push(`${slug ?? "library"}: ${e instanceof Error ? e.message : e}`);
        }
        s.done++;
        const q = s.systemQueue.find((x) => x.slug === slug);
        if (q) q.done = 1;
        await sleep(100);
      }

      // Regenerate any collage images whose content fingerprint drifted (games
      // added/removed, art changed), scoped to what this scan touched. Best-
      // effort — a failure just leaves the surface on its live collage. All
      // systems are scanned by now (bar at 100%), so flag finalization: the UI
      // shows "Finishing up…" instead of a frozen "Scanning files" here.
      if (!s.cancelRequested) {
        s.currentSystem = "";
        s.finalizing = true;
        await refreshDriftedThumbs(wholeLibrary ? undefined : scannedSlugs).catch(() => {});
      }
    } finally {
      s.running = false;
      s.finalizing = false;
      s.currentSystem = "";
      s.finishedAt = new Date().toISOString();
      const failed = s.errors.length > 0;
      logEvent({
        category: "scan",
        action: s.cancelled ? "scan.cancelled" : "scan.completed",
        summary: s.cancelled
          ? `Library scan cancelled (${s.added} added, ${s.updated} updated)`
          : `Library scan complete — ${s.added} added, ${s.updated} updated, ${s.moved} moved, ${s.markedMissing} removed`,
        detail: {
          scanned: s.scanned,
          added: s.added,
          updated: s.updated,
          moved: s.moved,
          markedMissing: s.markedMissing,
          hashed: s.hashed,
          systems: s.total,
          errors: s.errors.slice(0, 5),
        },
        severity: s.cancelled ? "warn" : failed ? "error" : "info",
        actor: s.actor,
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
