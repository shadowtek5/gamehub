// Unified background-job queue. Scans and scrapes are heavy and contend for the
// same DB + provider budget, so only ONE runs at a time. Requests made while a
// job is running are enqueued and shown as "Scheduled" on the downloads page;
// each job's `onDone` hook pumps the next one when it settles.
//
// Lives on globalThis (like the individual job states) so it survives page
// navigation within the server process. Automatic triggers (daily auto-scan,
// fs-watcher) enqueue through here too, so they serialize with manual jobs and
// show up in the UI instead of running invisibly.

import { getScanJobStatus, getLastScanAddedIds, startScanJob } from "./scanJob";
import {
  getScrapeJobStatus,
  startScrapeJob,
  buildScrapeTargets,
  buildScrapeTargetsForIds,
  countScrapeTargets,
} from "./providers/scrapeJob";
import { platformBySlug } from "./platforms";
import { localizeBoxartForIds, startBoxartLocalizeAll, getBoxartLocalizeStatus } from "./boxartLocalize";
import { startHashJob, getHashJobStatus } from "./hashJob";
import { startSystemArtJob, getSystemArtJobStatus } from "./systemArtJob";
import { startThumbRefreshJob, getThumbJobStatus } from "./systemThumb";

export type QueueKind = "scan" | "scrape" | "localize" | "hash" | "art" | "thumbs";

interface QueuedJob {
  id: number;
  kind: QueueKind;
  /** systems this job is scoped to; null = whole library */
  systems: string[] | null;
  /** scrape-only: fill gaps vs. full rescrape */
  onlyMissing?: boolean;
  /** scrape-only: scrape exactly these ROM ids (the new games from a scan) rather
   *  than resolving a system/onlyMissing target set */
  scrapeIds?: number[];
  /** scrape-only: metadata-only backfill (text + trailer/related, no artwork) */
  metadataOnly?: boolean;
  /** scrape-only: user the activity is logged as */
  initiatedBy?: number | null;
  /** who triggered this job (for the Activity Log); null = automatic/scheduled */
  actor?: { id: number; name: string } | null;
  /** scan-only: when the scan adds new games, auto-queue a scrape for them */
  autoScrape?: boolean;
  /** hash-only: also re-hash already-hashed .zip/.7z archives */
  rehashArchives?: boolean;
  enqueuedAt: string;
}

/** Display shape for a queued (not-yet-started) job. */
export interface QueuedView {
  id: number;
  kind: QueueKind;
  label: string;
  /** platform slugs this job is scoped to ([] = whole library) — for icons/names */
  systems: string[];
  detail: string;
}

const g = globalThis as unknown as { __jobQueue?: { pending: QueuedJob[]; nextId: number } };

function q() {
  if (!g.__jobQueue) g.__jobQueue = { pending: [], nextId: 1 };
  return g.__jobQueue;
}

/** Any heavy job currently occupying the single run slot. */
function anyRunning(): boolean {
  return (
    getScanJobStatus().running ||
    getScrapeJobStatus().running ||
    getBoxartLocalizeStatus().running ||
    getHashJobStatus().running ||
    getSystemArtJobStatus().running ||
    getThumbJobStatus().running
  );
}

function launch(job: QueuedJob): void {
  if (job.kind === "scan") {
    // After a scan adds games: download their box art into local storage (the
    // scanner never persists a live libretro URL), and — for automatic scans —
    // chase it with a scrape scoped to just those games for full metadata + art.
    const onDone = () => {
      try {
        const st = getScanJobStatus();
        const newIds = getLastScanAddedIds();
        if (!st.cancelled && newIds.length > 0) {
          // Localize box art immediately so new games aren't art-less until a
          // (possibly-never) full scrape runs. Fire-and-forget.
          void localizeBoxartForIds(newIds);
          if (job.autoScrape) {
            enqueueScrapeIds(newIds, job.actor?.id ?? null);
            console.log(`[auto-scrape] ${newIds.length} new game(s) — scrape queued`);
          }
        }
      } catch (e) {
        console.error("[post-scan] failed:", e);
      }
      pump();
    };
    startScanJob(job.systems, onDone, job.actor ?? null);
  } else if (job.kind === "localize") {
    // Optimize box art (whole library or selected systems) — download any
    // still-live libretro covers and (re)build the small grid thumbnails.
    startBoxartLocalizeAll(job.systems ?? undefined, pump);
  } else if (job.kind === "hash") {
    startHashJob(job.systems ?? undefined, { rehashArchives: job.rehashArchives }, pump);
  } else if (job.kind === "art") {
    startSystemArtJob(job.systems ?? undefined, pump);
  } else if (job.kind === "thumbs") {
    startThumbRefreshJob(job.systems ?? undefined, pump);
  } else {
    // Targets are resolved HERE (not at enqueue) so a scan queued ahead of this
    // scrape is reflected in what gets scraped. An id-scoped job (auto-scrape of
    // new games) targets exactly those ids and never wipes existing media.
    const { ids, systemQueue, wipe } = job.scrapeIds?.length
      ? { ...buildScrapeTargetsForIds(job.scrapeIds), wipe: false }
      : buildScrapeTargets(!!job.onlyMissing, job.systems);
    startScrapeJob(
      ids,
      job.systems,
      systemQueue,
      job.initiatedBy ?? null,
      job.metadataOnly ? false : wipe,
      pump,
      !!job.metadataOnly
    );
  }
}

/** Start the next queued job if the run slot is free. Called on job completion. */
function pump(): void {
  const s = q();
  if (anyRunning()) return;
  const next = s.pending.shift();
  if (next) launch(next);
}

export interface EnqueueResult {
  /** true = started immediately; false = queued behind a running/pending job */
  started: boolean;
  /** 1-based position in the queue when queued (0 when started now) */
  position: number;
  id: number;
}

function enqueue(job: Omit<QueuedJob, "id" | "enqueuedAt">): EnqueueResult {
  const s = q();
  const full: QueuedJob = { ...job, id: s.nextId++, enqueuedAt: new Date().toISOString() };
  if (!anyRunning() && s.pending.length === 0) {
    launch(full);
    return { started: true, position: 0, id: full.id };
  }
  s.pending.push(full);
  return { started: false, position: s.pending.length, id: full.id };
}

export function enqueueScan(
  systems: string[] | null,
  actor: { id: number; name: string } | null = null,
  opts: { autoScrape?: boolean } = {}
): EnqueueResult {
  return enqueue({ kind: "scan", systems, actor, autoScrape: opts.autoScrape });
}

export function enqueueScrape(
  onlyMissing: boolean,
  systems: string[] | null,
  initiatedBy: number | null,
  metadataOnly = false
): EnqueueResult {
  return enqueue({ kind: "scrape", systems, onlyMissing, initiatedBy, metadataOnly });
}

/** Queue a scrape of an explicit set of ROM ids (the new games from a scan).
 *  Serializes with other jobs and shows on the downloads page like any scrape. */
export function enqueueScrapeIds(ids: number[], initiatedBy: number | null = null): EnqueueResult {
  return enqueue({ kind: "scrape", systems: null, scrapeIds: ids, initiatedBy });
}

/** Queue a box-art optimize (whole library or selected systems): download live
 *  libretro covers + build grid thumbnails. Serializes with scans/scrapes so
 *  they never double-write art, and shows on the downloads page like any job. */
export function enqueueLocalize(systems?: string[]): EnqueueResult {
  return enqueue({ kind: "localize", systems: systems?.length ? systems : null });
}

/** A localize job is running or already waiting — so the button can't stack it. */
export function localizePendingOrRunning(): boolean {
  return getBoxartLocalizeStatus().running || q().pending.some((j) => j.kind === "localize");
}

/** Queue a file-hash pass (whole library, or a system subset / archive re-hash). */
export function enqueueHash(opts: { systems?: string[]; rehashArchives?: boolean } = {}): EnqueueResult {
  return enqueue({ kind: "hash", systems: opts.systems ?? null, rehashArchives: opts.rehashArchives });
}
export function hashPendingOrRunning(): boolean {
  return getHashJobStatus().running || q().pending.some((j) => j.kind === "hash");
}

/** Queue a system-art re-scrape (whole library or selected systems). */
export function enqueueSystemArt(systems?: string[]): EnqueueResult {
  return enqueue({ kind: "art", systems: systems?.length ? systems : null });
}
export function systemArtPendingOrRunning(): boolean {
  return getSystemArtJobStatus().running || q().pending.some((j) => j.kind === "art");
}

/** Queue a system-collage image refresh (whole library or selected systems). */
export function enqueueThumbs(systems?: string[]): EnqueueResult {
  return enqueue({ kind: "thumbs", systems: systems?.length ? systems : null });
}
export function thumbsPendingOrRunning(): boolean {
  return getThumbJobStatus().running || q().pending.some((j) => j.kind === "thumbs");
}

/** A scan is running or already waiting — used to dedupe automatic scans so the
 *  daily timer / fs-watcher never stack redundant full scans. */
export function scanPendingOrRunning(): boolean {
  return getScanJobStatus().running || q().pending.some((j) => j.kind === "scan");
}

/** Drop every queued job of a kind (the running one is cancelled via its own
 *  job module). Called by the cancel routes so "Cancel" clears the whole line. */
export function cancelQueuedKind(kind: QueueKind): void {
  const s = q();
  s.pending = s.pending.filter((j) => j.kind !== kind);
}

/** The waiting jobs, in run order, for the downloads "Up Next" section —
 *  complete with which systems and how much work each will do. */
export function queuedViews(): QueuedView[] {
  return q().pending.map((j) => {
    const systems = j.systems ?? [];
    // Name the consoles (up to 3, else a count) so the row reads e.g.
    // "SNES, Genesis" or "Whole library".
    const scope =
      systems.length === 0
        ? "Whole library"
        : systems.length <= 3
          ? systems.map((s) => platformBySlug(s)?.shortName ?? s).join(", ")
          : `${systems.length} systems`;
    if (j.kind === "scan") {
      return { id: j.id, kind: "scan", label: "Library scan", systems, detail: scope };
    }
    if (j.kind === "localize") {
      return { id: j.id, kind: "localize", label: "Optimize box art", systems, detail: scope };
    }
    if (j.kind === "hash") {
      return { id: j.id, kind: "hash", label: "Compute file hashes", systems, detail: scope };
    }
    if (j.kind === "art") {
      return { id: j.id, kind: "art", label: "Re-scrape system art", systems, detail: scope };
    }
    if (j.kind === "thumbs") {
      return { id: j.id, kind: "thumbs", label: "Refresh system images", systems, detail: scope };
    }
    // An id-scoped scrape (auto-scrape of new games) knows its exact count.
    if (j.scrapeIds?.length) {
      const n = j.scrapeIds.length;
      return {
        id: j.id,
        kind: "scrape",
        label: "New games",
        systems,
        detail: `${n.toLocaleString()} new game${n === 1 ? "" : "s"}`,
      };
    }
    let detail = scope;
    try {
      const g = countScrapeTargets(!!j.onlyMissing, j.systems ?? null);
      detail = `${scope} · ${g.toLocaleString()} game${g === 1 ? "" : "s"}${j.onlyMissing ? " · missing only" : ""}${j.metadataOnly ? " · metadata only" : ""}`;
    } catch {
      /* count is best-effort */
    }
    return {
      id: j.id,
      kind: "scrape",
      label: j.metadataOnly ? "Metadata backfill" : "Metadata scrape",
      systems,
      detail,
    };
  });
}
