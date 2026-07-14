"use client";

// Full-message reader for What's New cards. The home news cards clamp the body
// to a few lines; text-only entries (the GameHub changelog / announcements)
// have no link to follow, so tapping one opens this modal with the whole
// message. Portaled to <body> so the mobile chrome's transformed ancestors
// can't clip it (see AGENTS.md).

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { NewsItem } from "@/lib/news/types";

export default function NewsModal({ item, onClose }: { item: NewsItem; onClose: () => void }) {
  const t = useTranslations("common");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onB = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("gh-b", onB);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("gh-b", onB);
    };
  }, [onClose]);

  const accent = item.accent ?? "#1a9fff";
  const date = item.date ? item.date.slice(0, 10) : "";

  return createPortal(
    <div
      className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      data-overlay="open"
    >
      <div
        className="flex max-h-[86vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[6px] bg-[#1a1f27] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {item.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt="" className="h-[160px] w-full shrink-0 object-cover" />
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-dim">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
            <span>{item.category}</span>
            {date && <span className="ml-auto text-dim/80">{date}</span>}
          </div>
          <h2 className="text-[20px] font-bold leading-tight text-bright">{item.title}</h2>
          {item.body && (
            <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-body">{item.body}</p>
          )}
        </div>
        <div className="flex shrink-0 justify-end border-t border-white/10 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm font-semibold text-body transition-colors hover:bg-white/10"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
