"use client";

import { GpSwitch, GpSubHeader, GpRow, GpToggle } from "@/components/bpm/primitives";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ScraperOptions, ProviderId, ScraperItems, MediaKey } from "@/lib/providers/config";
import { GpDropdown } from "./bpm/primitives";
import { playSound } from "@/lib/sounds";

/** Item rows that map 1:1 to a downloadable media slot — these can carry a
 *  per-item preferred provider. (description/details are metadata; badges has a
 *  single source, so neither offers a choice.) */
const MEDIA_ROW_KEYS = new Set<keyof ScraperItems>([
  "boxart",
  "hero",
  "logo",
  "icon",
  "screenshot",
  "video",
  "manual",
]);

const PROVIDER_LABELS: Record<ProviderId, { name: string; noteKey: string }> = {
  screenscraper: { name: "ScreenScraper.fr", noteKey: "providerNotes.screenscraper" },
  emumovies: { name: "EmuMovies", noteKey: "providerNotes.emumovies" },
  igdb: { name: "IGDB", noteKey: "providerNotes.igdb" },
  mobygames: { name: "MobyGames", noteKey: "providerNotes.mobygames" },
  thegamesdb: { name: "TheGamesDB", noteKey: "providerNotes.thegamesdb" },
  steamgriddb: { name: "SteamGridDB", noteKey: "providerNotes.steamgriddb" },
  launchbox: {
    name: "LaunchBox DB",
    noteKey: "providerNotes.launchbox",
  },
  libretro: { name: "Libretro Thumbnails", noteKey: "providerNotes.libretro" },
};

const ITEM_ROWS: {
  key: keyof ScraperItems;
  labelKey: string;
  descriptionKey: string;
  sources: ProviderId[];
}[] = [
  {
    key: "description",
    labelKey: "items.description.label",
    descriptionKey: "items.description.desc",
    sources: ["screenscraper", "igdb", "mobygames", "launchbox"],
  },
  {
    key: "details",
    labelKey: "items.details.label",
    descriptionKey: "items.details.desc",
    sources: ["screenscraper", "igdb", "mobygames", "launchbox"],
  },
  {
    key: "boxart",
    labelKey: "items.boxart.label",
    descriptionKey: "items.boxart.desc",
    sources: ["screenscraper", "igdb", "mobygames", "steamgriddb", "launchbox", "libretro"],
  },
  {
    key: "hero",
    labelKey: "items.hero.label",
    descriptionKey: "items.hero.desc",
    sources: ["steamgriddb", "screenscraper", "igdb", "launchbox"],
  },
  {
    key: "logo",
    labelKey: "items.logo.label",
    descriptionKey: "items.logo.desc",
    sources: ["steamgriddb", "screenscraper", "launchbox"],
  },
  {
    key: "icon",
    labelKey: "items.icon.label",
    descriptionKey: "items.icon.desc",
    sources: ["steamgriddb", "launchbox"],
  },
  {
    key: "screenshot",
    labelKey: "items.screenshot.label",
    descriptionKey: "items.screenshot.desc",
    sources: ["screenscraper", "igdb", "mobygames", "launchbox", "libretro"],
  },
  {
    key: "video",
    labelKey: "items.video.label",
    descriptionKey: "items.video.desc",
    sources: ["screenscraper", "emumovies"],
  },
  {
    key: "manual",
    labelKey: "items.manual.label",
    descriptionKey: "items.manual.desc",
    sources: ["screenscraper", "emumovies"],
  },
  {
    key: "badges",
    labelKey: "items.badges.label",
    descriptionKey: "items.badges.desc",
    sources: ["igdb"],
  },
];

export default function ScraperOptionsPanel({
  initial,
  configured,
}: {
  initial: ScraperOptions;
  configured: Record<ProviderId, boolean>;
}) {
  const t = useTranslations("scraperOptions");
  const [priority, setPriority] = useState<ProviderId[]>(initial.priority);
  const [itemProviders, setItemProviders] = useState<Partial<Record<MediaKey, ProviderId>>>(
    initial.itemProviders ?? {}
  );
  const [items, setItems] = useState<ScraperItems>(initial.items);
  const [hashMatching, setHashMatching] = useState(initial.hashMatching !== false);
  const [boxStyle, setBoxStyle] = useState<"2d" | "3d">(initial.boxStyle ?? "2d");
  const [maxConcurrency, setMaxConcurrency] = useState<number>(initial.maxConcurrency ?? 3);
  const [saved, setSaved] = useState(false);

  // Auto-save on any change — no Save button. Skip the initial mount, then
  // persist (debounced) whenever priority/items/hashMatching/boxStyle change.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/scrape/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priority,
            itemProviders,
            items,
            hashMatching,
            boxStyle,
            maxConcurrency,
          }),
        });
        if (res.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        }
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [priority, itemProviders, items, hashMatching, boxStyle, maxConcurrency]);

  function move(index: number, delta: number) {
    playSound("navigate");
    setPriority((cur) => {
      const next = [...cur];
      const j = index + delta;
      if (j < 0 || j >= next.length) return cur;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function toggle(key: keyof ScraperItems) {
    playSound(items[key] ? "toggleOff" : "toggleOn");
    setItems((cur) => ({ ...cur, [key]: !cur[key] }));
  }

  function setPreferred(key: MediaKey, provider: ProviderId | "") {
    setItemProviders((cur) => {
      const next = { ...cur };
      if (provider) next[key] = provider;
      else delete next[key];
      return next;
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <GpSubHeader>{t("title")}</GpSubHeader>
        {saved && <span className="pb-2 text-[12px] text-[#8ce05f]">{t("saved")}</span>}
      </div>
      <p className="mb-5 text-[13px] text-dim">{t("intro")}</p>

      <div className="mb-6 flex flex-col gap-2">
        <GpRow
          label={t("hashMatching.label")}
          description={t("hashMatching.description")}
        >
          <GpToggle on={hashMatching} onChange={setHashMatching} label={t("hashMatching.toggleLabel")} />
        </GpRow>
        <GpRow label={t("boxStyle.label")} description={t("boxStyle.description")}>
          <GpDropdown
            value={boxStyle}
            width={180}
            onChange={(v) => setBoxStyle(v as "2d" | "3d")}
            options={[
              { value: "2d", label: t("boxStyle.2d") },
              { value: "3d", label: t("boxStyle.3d") },
            ]}
          />
        </GpRow>
        <GpRow
          label={t("concurrency.label")}
          description={t("concurrency.description")}
        >
          <GpDropdown
            value={String(maxConcurrency)}
            width={180}
            onChange={(v) => setMaxConcurrency(Number(v))}
            options={[1, 2, 3, 4, 6, 8, 10].map((n) => ({
              value: String(n),
              label: n === 1 ? t("concurrency.oneAtATime") : t("concurrency.nAtOnce", { n }),
            }))}
          />
        </GpRow>
      </div>

      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-dim">
        {t("providerPriority")}
      </div>
      <div className="mb-6 flex flex-col gap-2">
        {priority.map((p, i) => (
          <div
            key={p}
            className={`flex items-center gap-4 rounded-[3px] bg-[#23262e] px-5 py-3 ${
              configured[p] ? "" : "opacity-55"
            }`}
          >
            <span className="w-5 text-center text-lg font-black text-accent">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[15px] text-body">
                {PROVIDER_LABELS[p].name}
                {configured[p] ? (
                  <span className="rounded bg-[#59bf40]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8ed77c]">
                    {t("ready")}
                  </span>
                ) : (
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dim">
                    {t("notConfigured")}
                  </span>
                )}
              </div>
              <div className="text-xs text-dim">{t(PROVIDER_LABELS[p].noteKey)}</div>
            </div>
            <button
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="btn-gray DialogButton Focusable cursor-pointer px-2.5 py-1.5 text-sm disabled:cursor-default disabled:opacity-30"
              aria-label={t("moveUp", { name: PROVIDER_LABELS[p].name })}
            >
              ↑
            </button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === priority.length - 1}
              className="btn-gray DialogButton Focusable cursor-pointer px-2.5 py-1.5 text-sm disabled:cursor-default disabled:opacity-30"
              aria-label={t("moveDown", { name: PROVIDER_LABELS[p].name })}
            >
              ↓
            </button>
          </div>
        ))}
      </div>

      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-dim">
        {t("itemsToScrape")}
      </div>
      <div className="flex flex-col gap-2">
        {ITEM_ROWS.map((row) => {
          const activeSources = row.sources.filter((s) => configured[s]);
          const available = activeSources.length > 0;
          const isMedia = MEDIA_ROW_KEYS.has(row.key);
          const preferred = isMedia ? itemProviders[row.key as MediaKey] : undefined;
          // Reflect the effective order in the "via" line — a preferred provider
          // floats to the front.
          const ordered =
            preferred && activeSources.includes(preferred)
              ? [preferred, ...activeSources.filter((s) => s !== preferred)]
              : activeSources;
          const showPref = isMedia && available && items[row.key] && activeSources.length > 1;
          return (
            <div key={row.key} className="overflow-hidden rounded-[3px] bg-[#23262e]">
              <button
                onClick={() => available && toggle(row.key)}
                role="switch"
                aria-checked={available && items[row.key]}
                disabled={!available}
                className={`Focusable flex w-full items-center justify-between gap-3 p-3 text-left ${
                  available ? "cursor-pointer hover:bg-[#232a34]" : "cursor-default opacity-50"
                }`}
              >
                <span>
                  <span className="block text-[16px] text-body">{t(row.labelKey)}</span>
                  <span className="block text-xs text-dim">
                    {t(row.descriptionKey)}{" "}
                    {available ? (
                      <span className="text-accent/80">
                        {t("via", { names: ordered.map((s) => PROVIDER_LABELS[s].name).join(", ") })}
                      </span>
                    ) : (
                      <span className="text-danger/90">
                        {t("noProvider")}
                      </span>
                    )}
                  </span>
                </span>
                <GpSwitch on={available && items[row.key]} />
              </button>
              {showPref && (
                <div className="flex items-center justify-between gap-3 border-t border-white/5 p-3">
                  <span className="text-[13px] text-dim">
                    {t("preferredSource")}
                    <span className="block text-[11px] text-dim/70">
                      {t("preferredSourceHint")}
                    </span>
                  </span>
                  <GpDropdown
                    value={preferred ?? ""}
                    width={220}
                    onChange={(v) => setPreferred(row.key as MediaKey, v as ProviderId | "")}
                    options={[
                      { value: "", label: t("autoUsePriority") },
                      ...activeSources.map((s) => ({
                        value: s,
                        label: PROVIDER_LABELS[s].name,
                      })),
                    ]}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
