"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import MobileGameCard from "./MobileGameCard";
import { MobileSheet } from "./primitives";
import { platformBySlug } from "@/lib/platforms";
import { LANGUAGE_NAMES } from "@/lib/language";
import type { BrowseRomRow } from "@/lib/db";

const CHUNK = 60;

const SORTS = [
  { key: "name", label: "Alphabetical" },
  { key: "added", label: "Recently added" },
  { key: "played", label: "Last played" },
  { key: "playtime", label: "Most played" },
  { key: "release", label: "Release date" },
  { key: "rating", label: "Rating" },
] as const;

const MISSING = [
  { key: "meta", label: "Metadata" },
  { key: "boxart", label: "Box art" },
  { key: "hero", label: "Hero image" },
  { key: "logo", label: "Logo" },
  { key: "description", label: "Description" },
] as const;

/** Touch library browser — search, a bottom-sheet of filters, and an
 *  infinite-scroll grid. Reused for the full library, a single system
 *  (platformLock), and a collection (collectionLock). Backed by /api/library. */
export default function MobileLibrary({
  platformLock,
  collectionLock,
  virtualDim,
  virtualValue,
  platforms = [],
  genres = [],
  languages = [],
}: {
  platformLock?: string;
  collectionLock?: string;
  virtualDim?: string;
  virtualValue?: string;
  platforms?: string[];
  genres?: string[];
  languages?: string[];
}) {
  const t = useTranslations("mobileLibrary");
  const search = useSearchParams();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState("name");
  const [platformSel, setPlatformSel] = useState<string[]>([]);
  const [genreSel, setGenreSel] = useState<string[]>([]);
  const [langSel, setLangSel] = useState<string[]>([]);
  const [missingSel, setMissingSel] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [items, setItems] = useState<BrowseRomRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (search?.get("focus")) searchRef.current?.focus();
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const buildParams = useCallback(
    (offset: number) => {
      const p = new URLSearchParams();
      if (debounced) p.set("q", debounced);
      if (sort !== "name") p.set("sort", sort);
      if (platformLock) p.set("platform", platformLock);
      else if (platformSel.length) p.set("platform", platformSel.join(","));
      if (collectionLock) p.set("collection", collectionLock);
      if (virtualDim && virtualValue) {
        p.set("virtualDim", virtualDim);
        p.set("virtualValue", virtualValue);
      }
      if (genreSel.length) p.set("genre", genreSel.join(","));
      if (langSel.length) p.set("language", langSel.join(","));
      if (missingSel.length) p.set("missing", missingSel.join(","));
      p.set("offset", String(offset));
      p.set("limit", String(CHUNK));
      return p.toString();
    },
    [debounced, sort, platformLock, collectionLock, virtualDim, virtualValue, platformSel, genreSel, langSel, missingSel]
  );

  // Reload from the top whenever a filter changes
  useEffect(() => {
    const s = ++seq.current;
    // Toggling the loading flag before a fetch is a data-load effect, not a
    // cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/library?${buildParams(0)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (s !== seq.current) return;
        setItems(d.rows ?? []);
        setTotal(d.total ?? 0);
        setLoading(false);
      })
      .catch(() => s === seq.current && setLoading(false));
  }, [buildParams]);

  const loadMore = useCallback(() => {
    if (loading || items.length >= total) return;
    const s = seq.current;
    fetch(`/api/library?${buildParams(items.length)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (s !== seq.current) return;
        setItems((cur) => [...cur, ...(d.rows ?? [])]);
      })
      .catch(() => {});
  }, [buildParams, items.length, total, loading]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && loadMore());
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const activeFilters =
    platformSel.length + genreSel.length + langSel.length + missingSel.length;
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>, v: string) =>
    set((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]));
  const clearAll = () => {
    setPlatformSel([]);
    setGenreSel([]);
    setLangSel([]);
    setMissingSel([]);
    setSort("name");
  };

  return (
    <div>
      {/* Search + filter row */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim">
            <circle cx="10.5" cy="10.5" r="6.5" /><line x1="15.5" y1="15.5" x2="21" y2="21" />
          </svg>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-[8px] bg-[#1a1f27] py-2.5 pl-9 pr-3 text-sm text-body ring-1 ring-white/10 placeholder:text-dim focus:outline-none focus:ring-accent/50"
          />
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="relative flex h-10 items-center gap-1.5 rounded-[8px] bg-[#1a1f27] px-3 text-sm text-body ring-1 ring-white/10 active:bg-[#232a34]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h18l-7 8v6l-4 2v-8L3 5z" />
          </svg>
          {activeFilters > 0 && (
            <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold leading-5 text-black">
              {activeFilters}
            </span>
          )}
        </button>
      </div>

      <div className="mb-3 text-[12px] text-dim">
        {loading ? t("loading") : t("gameCount", { count: total })}
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {items.map((r) => (
          <MobileGameCard
            key={r.id}
            id={r.id}
            title={r.title}
            boxartUrl={r.boxart_url}
            platformSlug={r.platform_slug}
          />
        ))}
      </div>

      {!loading && items.length === 0 && (
        <div className="rounded-[8px] bg-[#1a1f27] p-6 text-center text-sm text-dim">
          {t("noMatch")}
        </div>
      )}
      <div ref={sentinel} className="h-10" />

      {/* Filter bottom sheet */}
      {sheetOpen && (
        <MobileSheet onClose={() => setSheetOpen(false)} zIndex={60}>
          <div className="flex items-center justify-between px-4 pb-2">
            <span className="text-[16px] font-bold text-bright">{t("filters")}</span>
            {activeFilters > 0 && (
              <button onClick={clearAll} className="text-[13px] font-semibold text-accent">
                {t("clearAll")}
              </button>
            )}
          </div>

          <FilterGroup label={t("sortBy")}>
            {SORTS.map((s) => (
              <Chip key={s.key} active={sort === s.key} onClick={() => setSort(s.key)}>
                {t(`sortOptions.${s.key}`)}
              </Chip>
            ))}
          </FilterGroup>

          {!platformLock && platforms.length > 0 && (
            <FilterGroup label={t("system")}>
              {platforms.map((slug) => (
                <Chip key={slug} active={platformSel.includes(slug)} onClick={() => toggle(setPlatformSel, slug)}>
                  {platformBySlug(slug)?.name ?? slug}
                </Chip>
              ))}
            </FilterGroup>
          )}

          {genres.length > 0 && (
            <FilterGroup label={t("genre")}>
              {genres.map((g) => (
                <Chip key={g} active={genreSel.includes(g)} onClick={() => toggle(setGenreSel, g)}>
                  {g}
                </Chip>
              ))}
            </FilterGroup>
          )}

          {languages.length > 0 && (
            <FilterGroup label={t("language")}>
              {languages.map((l) => (
                <Chip key={l} active={langSel.includes(l)} onClick={() => toggle(setLangSel, l)}>
                  {LANGUAGE_NAMES[l] ?? l}
                </Chip>
              ))}
            </FilterGroup>
          )}

          <FilterGroup label={t("missing")}>
            {MISSING.map((m) => (
              <Chip key={m.key} active={missingSel.includes(m.key)} onClick={() => toggle(setMissingSel, m.key)}>
                {t(`missingOptions.${m.key}`)}
              </Chip>
            ))}
          </FilterGroup>

          <div className="px-4 pt-3">
            <button
              onClick={() => setSheetOpen(false)}
              className="w-full rounded-[8px] bg-accent py-3 text-[15px] font-bold text-black active:opacity-90"
            >
              {t("showGames", { count: total })}
            </button>
          </div>
        </MobileSheet>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/5 px-4 py-3">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-dim">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 transition-colors ${
        active
          ? "bg-accent/20 text-accent ring-accent/40"
          : "bg-[#1a1f27] text-body ring-white/10 active:bg-[#232a34]"
      }`}
    >
      {children}
    </button>
  );
}
