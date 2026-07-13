"use client";

// Systems page body with a Grid / List view toggle (persisted per-device).
// Grid = the Deck-style art cards; List = a compact one-line-per-system view
// that's faster to scan. Cards carry data-system-slug so the cog menu
// (SystemsCardMenu) works in both views. Systems arrive pre-sorted by their
// metadata name.

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { platformBySlug } from "@/lib/platforms";
import { playSound } from "@/lib/sounds";
import SystemIcon from "@/components/SystemIcon";
import RibbonCollage, { CARD_LAYOUT } from "@/components/RibbonCollage";

export interface SystemCard {
  slug: string;
  name: string; // metadata name
  count: number;
  thumb: string | null;
  covers: string[];
  icon: string | null;
  ribbon: string | null;
}

const VIEW_KEY = "gh-systems-view";

export default function SystemsView({ systems }: { systems: SystemCard[] }) {
  const t = useTranslations("systemsView.view");
  const [view, setView] = useState<"grid" | "list">("grid");
  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "list" || saved === "grid") setView(saved);
  }, []);

  function choose(v: "grid" | "list") {
    playSound("tab");
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-black text-bright">{t("title")}</h1>
        <div className="flex items-center gap-1 rounded-[4px] bg-[#1a1f27] p-1 ring-1 ring-white/10">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => choose(v)}
              aria-label={v === "grid" ? t("gridViewAria") : t("listViewAria")}
              aria-pressed={view === v}
              className={`Focusable flex h-8 w-9 cursor-pointer items-center justify-center rounded-[3px] transition-colors ${
                view === v ? "bg-[#3d4450] text-bright" : "text-dim hover:text-bright"
              }`}
            >
              {v === "grid" ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" />
                  <rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <rect x="3" y="4" width="18" height="3" rx="1" /><rect x="3" y="10.5" width="18" height="3" rx="1" />
                  <rect x="3" y="17" width="18" height="3" rx="1" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {view === "list" ? (
        <div className="flex flex-col gap-1.5">
          {systems.map((s) => {
            const p = platformBySlug(s.slug);
            if (!p) return null;
            return (
              <Link
                key={s.slug}
                href={`/systems/${s.slug}`}
                data-system-slug={s.slug}
                className="deck-card group flex items-center gap-3 rounded-[4px] bg-[#23262e] px-4 py-2.5 transition-colors hover:bg-[#2b2f38]"
                title={t("systemTitle", { name: s.name, count: s.count })}
              >
                <SystemIcon platform={p} size="sm" iconUrl={s.icon} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-bright">{s.name}</span>
                {p?.ejsCore && <span className="text-[12px] font-semibold text-accent">{t("playable")}</span>}
                <span className="w-24 shrink-0 text-right text-[13px] tabular-nums text-dim">
                  {t("gameCount", { count: s.count })}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="allcollections_Collections_gh grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {systems.map((s) => {
            const p = platformBySlug(s.slug);
            if (!p) return null;
            const showRibbon = !s.thumb && s.covers.length > 0;
            const showMarquee = !s.thumb && !showRibbon && !!s.ribbon;
            return (
              <Link
                key={s.slug}
                href={`/systems/${s.slug}`}
                data-system-slug={s.slug}
                className="allcollections_Collection_gh deck-card group relative block aspect-[16/10] overflow-hidden rounded-[4px] bg-[#23262e]"
                title={t("systemTitle", { name: s.name, count: s.count })}
              >
                <div
                  className="allcollections_CollectionBG_gh absolute inset-0 transition-transform duration-300 group-hover:scale-[1.04]"
                  style={{
                    background: `linear-gradient(120deg, #0b0f14 25%, #16202d 60%, ${p?.color ?? "#2a475e"}44 100%)`,
                  }}
                >
                  {s.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : showRibbon ? (
                    <div className="absolute inset-0 [perspective:800px]">
                      <RibbonCollage covers={s.covers} color={p?.color ?? "#2a475e"} layout={CARD_LAYOUT} />
                    </div>
                  ) : showMarquee ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.ribbon!} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover [filter:saturate(1.1)]" />
                  ) : null}
                </div>
                {!s.thumb && !showRibbon && !showMarquee && (
                  <div className="pointer-events-none absolute -right-3 -top-6 select-none text-[90px] font-black leading-none text-white/5">
                    {p?.shortName ?? s.slug}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
                  <SystemIcon platform={p} size="md" iconUrl={s.icon} />
                  <div className="min-w-0">
                    <div className="allcollections_CollectionLabel_gh truncate text-[17px] font-bold text-bright drop-shadow">
                      {s.name}
                    </div>
                    <div className="allcollections_CollectionLabelCount_gh mt-0.5 text-[12px] text-body/90 drop-shadow">
                      {t("gameCount", { count: s.count })}
                      {p?.ejsCore && <span className="ml-2 text-accent">· {t("playable")}</span>}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
