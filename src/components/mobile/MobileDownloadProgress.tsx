"use client";

import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { DownloadJob, progressPercent } from "@/lib/useOpProgress";

// Mobile "downloading progress" modal for the cog operations (art picks,
// metadata scrapes). Rendered through a portal to document.body so the fixed
// overlay escapes the mobile chrome's transformed/blurred ancestors (the
// containing-block trap) and covers the real viewport.
export default function MobileDownloadProgress({ job }: { job: DownloadJob | null }) {
  const t = useTranslations("downloadProgress");
  if (!job || typeof document === "undefined") return null;
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

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-[320px] rounded-2xl bg-[#1a1f27] p-6 text-center ring-1 ring-white/10">
        <div className="text-[16px] font-bold text-bright">{job.title}</div>
        {job.subtitle && <div className="mt-1 truncate text-[13px] text-dim">{job.subtitle}</div>}
        {determinate ? (
          <>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 text-[12px] tabular-nums text-dim">
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
            <div className="mx-auto mt-4 h-8 w-8 animate-spin rounded-full border-4 border-white/10 border-t-accent" />
            <div className="mt-3 text-[12px] text-dim">{phaseLabel}</div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
