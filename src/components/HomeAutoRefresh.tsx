"use client";

// Keeps the home carousels fresh: when a background scan or scrape finishes,
// the newly-added games and freshly-scraped artwork should appear without a
// manual reload. The home pages are force-dynamic server components, so a
// router.refresh() re-runs their shelf queries and re-renders the carousels.
//
// There's no push channel for jobs — the app polls GET /api/jobs (same source
// the header JobIndicator and downloads page use). We watch the newest
// finishedAt across scan/scrape jobs; when it advances past what we saw on
// mount, a job just completed, so we refresh once. Polling pauses while the
// tab is hidden to avoid needless load.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface JobView {
  kind?: string;
  finishedAt?: string | null;
}

const POLL_MS = 3500;

export default function HomeAutoRefresh() {
  const router = useRouter();
  // null until the first poll establishes a baseline; then holds the newest
  // scan/scrape finishedAt (ms) we've observed.
  const baseline = useRef<number | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const newestFinish = (jobs: JobView[]) =>
      jobs.reduce((max, j) => {
        if (j.kind !== "scan" && j.kind !== "scrape") return max;
        const t = j.finishedAt ? Date.parse(j.finishedAt) : 0;
        return Number.isFinite(t) && t > max ? t : max;
      }, 0);

    const poll = async () => {
      if (!stopped && document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/jobs", { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            const finished = newestFinish(data.jobs ?? []);
            if (baseline.current === null) {
              baseline.current = finished; // first poll = baseline, no refresh
            } else if (finished > baseline.current) {
              baseline.current = finished;
              router.refresh(); // a scan/scrape completed → pull fresh shelves
            }
          }
        } catch {
          /* transient — try again next tick */
        }
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };

    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  return null;
}
