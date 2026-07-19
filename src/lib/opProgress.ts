// Generic in-memory progress for cog operations — metadata scrapes and
// art-picker downloads — polled by the UI to drive a download progress modal.
//
// Keyed by an opaque string so per-game and per-system operations share one
// store (see romOpKey / systemOpKey). Values are best-effort and ephemeral:
// entries self-expire (TTL) so an abandoned or crashed op can never leak, and a
// finished op lingers just long enough for the poller to observe its terminal
// state. This is deliberately NOT the heavy background-job queue (jobQueue.ts) —
// these are short, foreground, request-scoped downloads.

export interface OpProgress {
  /** Machine phase: matching | metadata | media | searching | downloading | done | error. */
  phase: string;
  /** Items or bytes completed. */
  done: number;
  /** Items or bytes total (0 = indeterminate → the UI shows an animated bar). */
  total: number;
  unit: "items" | "bytes";
  /** Human detail for the current step (a media kind, a system name, …). */
  label?: string;
  error?: string;
  /** Terminal state reached (success or error). */
  finished: boolean;
  /** Last-updated epoch ms — used for GC and staleness. */
  at: number;
}

const g = globalThis as unknown as { __opProgress?: Map<string, OpProgress> };
function store(): Map<string, OpProgress> {
  return (g.__opProgress ??= new Map());
}

const TTL_MS = 60_000;
function gc() {
  const now = Date.now();
  for (const [k, v] of store()) if (now - v.at > TTL_MS) store().delete(k);
}

/** Begin (or reset) an operation's progress. */
export function startOpProgress(key: string, unit: "items" | "bytes", label?: string) {
  gc();
  store().set(key, { phase: "searching", done: 0, total: 0, unit, label, finished: false, at: Date.now() });
}

/** Merge a progress update. No-op if the op was cleared (keeps writers simple). */
export function setOpProgress(key: string, patch: Partial<OpProgress> & { phase: string }) {
  const prev = store().get(key);
  store().set(key, {
    unit: "items",
    done: 0,
    total: 0,
    finished: false,
    ...prev,
    ...patch,
    at: Date.now(),
  });
}

/** Mark an op finished (fills the bar on success; records the message on error).
 *  The entry lingers until the next GC so the poller can render the final state. */
export function finishOpProgress(key: string, error?: string) {
  const prev = store().get(key);
  const total = prev?.total ?? 0;
  store().set(key, {
    phase: error ? "error" : "done",
    done: error ? (prev?.done ?? 0) : total,
    total,
    unit: prev?.unit ?? "items",
    label: prev?.label,
    error,
    finished: true,
    at: Date.now(),
  });
}

export function getOpProgress(key: string): OpProgress | null {
  return store().get(key) ?? null;
}

export function clearOpProgress(key: string) {
  store().delete(key);
}

export const romOpKey = (romId: number | string, op: string) => `rom:${romId}:${op}`;
export const systemOpKey = (slug: string, op: string) => `system:${slug}:${op}`;
