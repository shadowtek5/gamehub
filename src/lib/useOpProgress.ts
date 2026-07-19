"use client";

import { useCallback, useRef, useState } from "react";

// Client hook that drives the "downloading progress bar" modal for the cog
// operations (art-picker downloads, metadata scrapes). It runs the work
// promise while polling a live-progress endpoint, exposing a `job` state the
// platform modal (DownloadProgressModal / MobileDownloadProgress) renders.
//
// The op-store endpoints already return this shape; a `normalize` fn adapts
// other sources (e.g. the scrape job status) into it.

export interface OpProgressState {
  phase: string;
  done: number;
  total: number;
  unit: "items" | "bytes";
  label?: string;
  error?: string;
  finished: boolean;
}

export interface DownloadJob {
  title: string;
  subtitle?: string;
  progress: OpProgressState;
}

const INITIAL: OpProgressState = {
  phase: "searching",
  done: 0,
  total: 0,
  unit: "items",
  finished: false,
};

interface RunOpts<T> {
  title: string;
  subtitle?: string;
  pollUrl: string;
  work: () => Promise<T>;
  /** Adapt a raw poll payload into OpProgressState; return null to ignore it. */
  normalize?: (raw: unknown) => OpProgressState | null;
}

function defaultNormalize(raw: unknown): OpProgressState | null {
  const p = raw as Partial<OpProgressState> | undefined;
  if (!p || typeof p.phase !== "string" || p.phase === "idle") return null;
  return {
    phase: p.phase,
    done: p.done ?? 0,
    total: p.total ?? 0,
    unit: p.unit === "bytes" ? "bytes" : "items",
    label: p.label,
    error: p.error,
    finished: !!p.finished,
  };
}

export function useOpProgress() {
  const [job, setJob] = useState<DownloadJob | null>(null);
  const stopRef = useRef(false);

  const run = useCallback(async <T>(opts: RunOpts<T>): Promise<T> => {
    setJob({ title: opts.title, subtitle: opts.subtitle, progress: INITIAL });
    stopRef.current = false;
    const normalize = opts.normalize ?? defaultNormalize;

    void (async () => {
      while (!stopRef.current) {
        try {
          const r = await fetch(opts.pollUrl, { cache: "no-store" });
          if (r.ok) {
            const p = normalize(await r.json());
            if (p) setJob((cur) => (cur ? { ...cur, progress: p } : cur));
          }
        } catch {
          /* transient poll error — keep going */
        }
        await new Promise((res) => setTimeout(res, 300));
      }
    })();

    try {
      return await opts.work();
    } finally {
      stopRef.current = true;
      setJob(null);
    }
  }, []);

  return { job, run };
}

/** items → "3 / 5", bytes → percent + MB, for the modal's numeric line. */
export function progressPercent(p: OpProgressState): number | null {
  if (p.total <= 0) return null;
  return Math.min(100, Math.round((p.done / p.total) * 100));
}
