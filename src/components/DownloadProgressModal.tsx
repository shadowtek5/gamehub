"use client";

import { useTranslations } from "next-intl";
import { GpProgress } from "./bpm/primitives";
import { DownloadJob, progressPercent } from "@/lib/useOpProgress";

// Desktop/Big-Picture "downloading progress" modal for the cog operations.
// Renders a filling GpProgress bar when a total is known (bytes or items) and
// an animated spinner while the server is still searching/matching. Driven by
// the useOpProgress hook's `job`.
export default function DownloadProgressModal({ job }: { job: DownloadJob | null }) {
  const t = useTranslations("downloadProgress");
  if (!job) return null;
  const p = job.progress;
  const pct = progressPercent(p);
  const determinate = pct != null && (p.phase === "downloading" || p.phase === "media" || p.phase === "saving");

  const phaseLabel = (() => {
    switch (p.phase) {
      case "matching": return t("matching");
      case "metadata": return t("metadata");
      case "media": return t("media");
      case "downloading": return t("downloading");
      case "saving": return t("saving");
      default: return t("searching");
    }
  })();

  return (
    <div className="fixed inset-0 z-[1650] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="deck-backdrop relative w-[380px] rounded-[4px] bg-[#171d25] p-7 text-center shadow-2xl ring-1 ring-white/10">
        {determinate ? (
          <>
            <div className="text-lg font-bold text-bright">{job.title}</div>
            {job.subtitle && <div className="mt-1 truncate text-sm text-dim">{job.subtitle}</div>}
            <GpProgress value={pct!} className="mt-4" />
            <div className="mt-2 text-xs tabular-nums text-dim">
              {p.unit === "bytes"
                ? t("mbProgress", {
                    done: (p.done / 1048576).toFixed(1),
                    total: (p.total / 1048576).toFixed(1),
                    pct: pct!,
                  })
                : t("itemsProgress", { done: p.done, total: p.total, pct: pct! })}
              {p.label ? ` · ${p.label}` : ""}
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-accent" />
            <div className="text-lg font-bold text-bright">{job.title}</div>
            {job.subtitle && <div className="mt-1 truncate text-sm text-dim">{job.subtitle}</div>}
            <div className="mt-3 text-xs text-dim">{phaseLabel}</div>
          </>
        )}
      </div>
    </div>
  );
}
