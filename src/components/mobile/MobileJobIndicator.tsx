"use client";

// Mobile top-bar job indicator: while a background scan/scrape runs it shows a
// small progress pill; tapping it opens the mobile downloads page. Hidden when
// nothing is running (and always hidden for non-admins, since /api/jobs returns
// no jobs for them).

import Link from "next/link";
import { useEffect, useState } from "react";

interface JobView {
  kind: "scan" | "scrape";
  label: string;
  running: boolean;
  done: number;
  total: number;
}

export default function MobileJobIndicator() {
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch("/api/jobs");
        if (res.ok && !stop) {
          const data = await res.json();
          setJobs((data.jobs ?? []).filter((j: JobView) => j.running));
          setQueuedCount((data.queued ?? []).length);
        }
      } catch {
        /* ignore */
      }
      if (!stop) timer = setTimeout(poll, 2500);
    }
    poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);

  if (jobs.length === 0) return null;

  // Feature the busiest job (usually the only one).
  const job = jobs[0];
  const pct = job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0;

  return (
    <Link
      href="/mobile/downloads"
      aria-label={`${job.label} — ${job.done}/${job.total}`}
      className="flex h-9 items-center gap-1.5 rounded-full bg-accent/15 px-2.5 text-accent active:bg-accent/25"
    >
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/40 border-t-accent" aria-hidden />
      <span className="text-[11px] font-bold tabular-nums">{pct}%</span>
      {queuedCount > 0 && <span className="text-[11px] font-bold text-accent/70">+{queuedCount}</span>}
    </Link>
  );
}
