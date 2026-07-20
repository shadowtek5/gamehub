"use client";

// "Surprise me" game roulette — picks one random game from the library with a
// few filters, for when 44,000 games is too many to choose from. The modal is
// portaled to <body>: on mobile the app chrome uses blur/transform ancestors,
// which would otherwise clip a position:fixed overlay to that ancestor.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import GameCover from "@/components/GameCover";
import { platformBySlug } from "@/lib/platforms";
import { playSound } from "@/lib/sounds";

interface Pick {
  id: number;
  title: string;
  platform_slug: string;
  platform_name: string;
  boxart_url: string | null;
  genre: string | null;
  hltb_main: number | null;
  playable: boolean;
}

export default function Roulette({ className = "" }: { className?: string }) {
  const t = useTranslations("roulette");
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const [rolling, setRolling] = useState(false);
  const [playable, setPlayable] = useState(true);
  const [unplayed, setUnplayed] = useState(true);
  const [maxHours, setMaxHours] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const roll = useCallback(async () => {
    setRolling(true);
    try {
      const qs = new URLSearchParams();
      if (playable) qs.set("playable", "1");
      if (unplayed) qs.set("unplayed", "1");
      if (maxHours > 0) qs.set("maxHours", String(maxHours));
      const res = await fetch(`/api/roulette?${qs}`, { cache: "no-store" });
      const data = await res.json();
      setPick(data.rom ?? null);
    } finally {
      setRolling(false);
    }
  }, [playable, unplayed, maxHours]);

  // roll once when the modal opens, and whenever a filter changes
  useEffect(() => { if (open) void roll(); }, [open, roll]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const hours = pick?.hltb_main ? Math.max(1, Math.round(pick.hltb_main / 3600)) : null;

  const modal = !open ? null : (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[420px] rounded-[8px] bg-[#1a1f27] p-5 ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <h2 className="flex-1 text-[20px] font-bold text-bright">🎲 {t("title")}</h2>
          <button onClick={() => setOpen(false)} className="text-dim hover:text-bright" aria-label={t("close")}>✕</button>
        </div>

        {/* result */}
        <div className="mb-4 flex min-h-[150px] items-center gap-4 rounded-[6px] bg-black/30 p-3">
          {rolling ? (
            <p className="w-full text-center text-[14px] text-dim">{t("rolling")}</p>
          ) : pick ? (
            <>
              <span className="h-[132px] w-[96px] shrink-0 overflow-hidden rounded-[4px] bg-black/40">
                <GameCover
                  title={pick.title}
                  boxartUrl={pick.boxart_url}
                  color={platformBySlug(pick.platform_slug)?.color}
                  shortName={platformBySlug(pick.platform_slug)?.shortName}
                  className="h-full w-full"
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-bold leading-tight text-bright">{pick.title}</div>
                <div className="mt-1 text-[13px] text-dim">{pick.platform_name}</div>
                {pick.genre && <div className="mt-0.5 truncate text-[12px] text-dim/80">{pick.genre}</div>}
                {hours && <div className="mt-1 text-[12px] text-accent">{t("aboutHours", { hours })}</div>}
              </div>
            </>
          ) : (
            <p className="w-full text-center text-[14px] text-dim">{t("noMatch")}</p>
          )}
        </div>

        {/* filters */}
        <div className="mb-4 flex flex-col gap-2 text-[13px]">
          <label className="flex cursor-pointer items-center gap-2 text-body">
            <input type="checkbox" checked={playable} onChange={(e) => setPlayable(e.target.checked)} />
            {t("playableOnly")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-body">
            <input type="checkbox" checked={unplayed} onChange={(e) => setUnplayed(e.target.checked)} />
            {t("unplayedOnly")}
          </label>
          <label className="flex items-center gap-2 text-body">
            {t("maxLength")}
            <select
              value={maxHours}
              onChange={(e) => setMaxHours(Number(e.target.value))}
              className="rounded-[4px] bg-[#23262e] px-2 py-1 text-body outline-none"
            >
              <option value={0}>{t("anyLength")}</option>
              <option value={2}>{t("underHours", { hours: 2 })}</option>
              <option value={5}>{t("underHours", { hours: 5 })}</option>
              <option value={10}>{t("underHours", { hours: 10 })}</option>
              <option value={20}>{t("underHours", { hours: 20 })}</option>
            </select>
          </label>
        </div>

        <div className="flex gap-2">
          <button onClick={() => void roll()} disabled={rolling} className="flex-1 rounded-[4px] bg-[#3d4450] px-4 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-[#4a5260] disabled:opacity-50">
            {t("reroll")}
          </button>
          {pick && (
            <>
              <a href={`/game/${pick.id}`} className="rounded-[4px] bg-[#3d4450] px-4 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-[#4a5260]">
                {t("open")}
              </a>
              {/* full page load: EmulatorJS can't re-init inside one document */}
              {pick.playable && (
                <a href={`/play/${pick.id}`} className="rounded-[4px] bg-[#1a9fff] px-4 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-[#2aa7ff]">
                  {t("play")}
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => { playSound("modalOpen"); setOpen(true); }}
        className={`Focusable inline-flex items-center gap-1.5 rounded-[4px] bg-white/[0.08] px-3 py-1.5 text-[13px] font-semibold text-body outline-none transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/60 ${className}`}
      >
        🎲 {t("title")}
      </button>
      {mounted && modal && createPortal(modal, document.body)}
    </>
  );
}
