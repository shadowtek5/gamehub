"use client";
/* eslint-disable @next/next/no-img-element */

// Mobile Collections body with a Grid / List toggle (persisted per-device),
// mirroring the desktop Collections page. Grid = cover-mosaic tiles; List =
// a compact one-line-per-collection view.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

export interface MobileCollectionCard {
  id: number;
  name: string;
  count: number;
  smart: boolean;
  covers: string[];
}

const VIEW_KEY = "gh-collections-view";

export default function MobileCollectionsView({ collections }: { collections: MobileCollectionCard[] }) {
  const t = useTranslations("mobilePagesB.collections");
  const tv = useTranslations("systemsView.view");
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

  if (collections.length === 0) return null;

  return (
    <div className="mb-7">
      <div className="mb-3 flex justify-end">
        <div className="flex items-center gap-1 rounded-[8px] bg-[#1a1f27] p-1 ring-1 ring-white/10">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => choose(v)}
              aria-label={v === "grid" ? tv("gridViewAria") : tv("listViewAria")}
              aria-pressed={view === v}
              className={`flex h-8 w-9 items-center justify-center rounded-[6px] transition-colors ${
                view === v ? "bg-[#3d4450] text-bright" : "text-dim"
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
          {collections.map((c) => (
            <Link
              key={c.id}
              href={`/mobile/collections/${c.id}`}
              className="flex items-center gap-2 rounded-[10px] bg-[#1a1f27] px-3.5 py-3 ring-1 ring-white/5 active:bg-[#232a34]"
            >
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-bright">{c.name}</span>
              {c.smart && <span className="shrink-0 text-[11px] text-accent">⚡</span>}
              <span className="shrink-0 text-[12px] tabular-nums text-dim">{t("gamesCount", { count: c.count })}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {collections.map((c) => (
            <Link
              key={c.id}
              href={`/mobile/collections/${c.id}`}
              className="overflow-hidden rounded-[12px] bg-[#1a1f27] ring-1 ring-white/5 active:ring-accent/40"
            >
              <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-px bg-black/30">
                {c.covers.length > 0 ? (
                  Array.from({ length: 4 }).map((_, i) =>
                    c.covers[i] ? (
                      <img key={i} src={c.covers[i]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div key={i} className="h-full w-full bg-[#12161c]" />
                    )
                  )
                ) : (
                  <div className="col-span-2 row-span-2 flex items-center justify-center bg-gradient-to-br from-[#1b2531] to-[#23262e] text-3xl text-white/20">
                    ▤
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-semibold text-bright">{c.name}</span>
                    {c.smart && <span className="shrink-0 text-[11px] text-accent">⚡</span>}
                  </div>
                  <div className="text-[12px] text-dim">{t("gamesCount", { count: c.count })}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
