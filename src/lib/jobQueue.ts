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

export type QueueKind = "scan" | "scrape";

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
  return getScanJobStatus().running || getScrapeJobStatus().running;
}

function launch(job: QueuedJob): void {
  if (job.kind === "scan") {
    // When an automatic scan (watcher / schedule) adds new games, chase it with a
    // scrape scoped to the same systems, onlyMissing=true — so exactly the freshly
    // added, not-yet-scraped games get metadata + art, without re-scraping the rest.
    const onDone = job.autoScrape
      ? () => {
          try {
            const st = getScanJobStatus();
            const newIds = getLastScanAddedIds();
            if (!st.cancelled && newIds.length > 0) {
              // Scrape exactly the games this scan added — a targeted job that
              // shows on the downloads page, not a whole-system rescrape.
              enqueueScrapeIds(newIds, job.actor?.id ?? null);
              console.log(`[auto-scrape] ${newIds.length} new game(s) — scrape queued`);
            }
          } catch (e) {
            console.error("[auto-scrape] failed to queue:", e);
          }
          pump();
        }
      : pump;
    startScanJob(job.systems, onDone, job.actor ?? null);
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
