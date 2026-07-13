"use client";

// Header download-style indicator: while a background scan/scrape runs, the
// current system's icon appears here with a thin progress bar; it advances to
// the next system as each completes. Click → the downloads page.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { platformBySlug } from "@/lib/platforms";
import SystemIcon from "@/components/SystemIcon";

interface JobView {
  kind: "scan" | "scrape";
  label: string;
  running: boolean;
  currentSystem: string;
  done: number;
  total: number;
  /** scraped/downloaded system icon; null → the built-in glyph */
  systemIcon?: string | null;
}

export default function JobIndicator() {
  const t = useTranslations("chrome.jobIndicator");
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch("/api/jobs");
        if (res.ok) {
          const data = await res.json();
          if (!stop) {
            setJobs((data.jobs ?? []).filter((j: JobView) => j.running));
            setQueuedCount((data.queued ?? []).length);
          }
        }
      } catch {
        /* ignore */
      }
      if (!stop) timer = setTimeout(poll, 2000);
    }
    poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);

  if (jobs.length === 0) return null;

  return (
    <Link
      href="/downloads"
      data-nav-skip
      className="mr-1 flex h-10 items-center gap-2 px-2 outline-none transition-colors hover:bg-white/10 focus:bg-white/15"
      title={t("manageDownloads")}
    >
      {jobs.map((j) => {
        const platform = j.currentSystem ? platformBySlug(j.currentSystem) : null;
        const pct = j.total > 0 ? Math.min(100, Math.round((j.done / j.total) * 100)) : 0;
        return (
          <span key={j.kind} className="flex flex-col items-center gap-[3px]" title={`${j.label} — ${platform?.name ?? t("library")} · ${j.done}/${j.total}`}>
            {platform ? (
              <SystemIcon platform={platform} size="sm" iconUrl={j.systemIcon} />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#141a21] text-white/70 ring-1 ring-white/10">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 20h14" /></svg>
              </span>
            )}
            <span className="h-[3px] w-7 overflow-hidden rounded-full bg-white/20">
              <span className="block h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </span>
          </span>
        );
      })}
      {queuedCount > 0 && (
        <span
          className="ml-0.5 rounded-full bg-white/15 px-1.5 text-[11px] font-bold text-white/80"
          title={t("jobsScheduled", { count: queuedCount })}
        >
          +{queuedCount}
        </span>
      )}
    </Link>
  );
}
