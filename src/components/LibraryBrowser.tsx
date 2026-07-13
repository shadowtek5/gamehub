"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import GameCard from "./GameCard";
import { cardFootprint, boxLayoutForSlug, type BoxLayout } from "@/lib/boxLayout";
import CollectionShelves from "./CollectionShelves";
import type { BrowseRomRow, LibraryCollectionTab } from "@/lib/db";
import { LANGUAGE_NAMES } from "@/lib/language";
import { PLATFORMS_SORTED } from "@/lib/platforms";
import { playSound } from "@/lib/sounds";
import { previousPath } from "@/lib/routePath";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  GpDropdown,
  GpModal,
  GpButton,
  GpPill,
  GpFilterDialog,
  GpFilterSection,
  GpCheck,
  GpRadioRow,
} from "./bpm/primitives";

/** Cards rendered per batch — more stream in as you approach the bottom */
const CHUNK = 150;

/** Play-status views. On system pages these are the pill tabs; on the library
 *  they move into the FILTER modal (the tabs there are collections). */
const STATUS = [
  { key: "all" },
  { key: "favorites" },
  { key: "playing" },
  { key: "backlog" },
  { key: "beaten" },
  { key: "hidden" },
] as const;

/** SORT BY options — keys map to searchLibraryBrowse's BROWSE_SORTS. Mirrors
 *  Steam's list; "Friends Playing" is omitted (GameHub tracks no friend
 *  presence) and Metacritic maps to the game's rating. */
const SORTS = [
  { key: "name" },
  { key: "achievements" },
  { key: "playtime" },
  { key: "played" },
  { key: "release" },
  { key: "added" },
  { key: "size" },
  { key: "rating" },
] as const;

/** Player-mode facets — matched against the scraped game_modes column. These
 *  are the values the scraper writes (see providers/screenscraper + igdb). */
const MODES = ["Single player", "Multiplayer", "Co-operative"] as const;

/** "Missing" facets — surface library gaps to scrape/fix. Keys map to
 *  searchLibraryBrowse's MISSING_COND; a game matches if it lacks ANY chosen
 *  piece. */
const MISSING = [
  { key: "meta" },
  { key: "boxart" },
  { key: "hero" },
  { key: "logo" },
  { key: "description" },
] as const;

/** Sentinel collection tab that shows the Collections shelf view instead of a grid */
const SHELVES = "__shelves__";
/** Sentinel tab that shows favorited games as a grid (like All Games) */
const FAVORITES = "__favorites__";

/** L1/R1 bumper chip flanking the centered collection tabs (measured layout) */
function Bumper({ label }: { label: string }) {
  return (
    <span className="flex h-[26px] min-w-[34px] items-center justify-center rounded-[4px] bg-white/10 px-2 text-[13px] font-black tracking-wide text-white/80">
      {label}
    </span>
  );
}

export default function LibraryBrowser({
  roms,
  remote = false,
  collections = [],
  totalGames,
  favoritesCount,
  platforms = [],
  platformLock,
  collectionLock,
  virtualLock,
  boxLayout,
  systemIcons,
  variants = [],
  genres = [],
  languages = [],
  hidePlatformFilter = false,
  defaultVariant = "all",
  defaultLanguage = "all",
  tools,
}: {
  /** Local mode (system pages): the full list, filtered client-side */
  roms?: BrowseRomRow[];
  /** Remote mode (/library): rows are fetched page-by-page from /api/library */
  remote?: boolean;
  /** Remote mode: the user's collections, shown as the tab strip */
  collections?: LibraryCollectionTab[];
  /** Remote mode: stable full-library count for the "All Games" tab */
  totalGames?: number;
  /** Remote mode: favorites count for the "Favorites" tab */
  favoritesCount?: number;
  /** Remote mode: platform slugs present in the library (filter dropdown) */
  platforms?: string[];
  /** Remote mode: pin every query to one platform (system pages) */
  platformLock?: string;
  /** Remote mode: pin every query to one collection id (collection pages) */
  collectionLock?: string;
  /** Remote mode: pin every query to a virtual metadata group (virtual pages) */
  virtualLock?: { dim: string; value: string };
  /** Locked system's effective box-art shape (system pages) — for row packing */
  boxLayout?: BoxLayout;
  /** slug → console icon URL; when set, cards show a system badge (library/favorites) */
  systemIcons?: Record<string, string | null>;
  /** Remote mode: variant names present in the library (filter dropdown) */
  variants?: string[];
  /** Remote mode: genres present in the library (filter dropdown) */
  genres?: string[];
  /** Remote mode: language codes present in the library (filter dropdown) */
  languages?: string[];
  hidePlatformFilter?: boolean;
  /** Initial variant filter — system pages default to the main library */
  defaultVariant?: string;
  /** Initial language filter — system pages default to English (except Japanese consoles) */
  defaultLanguage?: string;
  /** Extra control rendered before the search box (e.g. the ⚙ system menu) */
  tools?: React.ReactNode;
}) {
  const t = useTranslations("library");
  const local = useMemo(() => roms ?? [], [roms]);
  // Header search + footer FILTER/SORT chrome (Steam's library layout). Both the
  // full library and a system's detail page use it; only a local (non-remote)
  // grid keeps the old inline pill/dropdown row.
  const chromeMode = remote;
  // Collection-specific extras (the collection tab strip, the System filter
  // section, "Save as Dynamic Collection") belong to the full library only —
  // a system page pins one platform, so those don't apply.
  const libraryMode = remote && !platformLock && !collectionLock && !virtualLock;
  const [tab, setTab] = useState<string>("all");
  const [collection, setCollection] = useState("all");
  const [sort, setSort] = useState("name");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [variant, setVariant] = useState(defaultVariant);
  const [genre, setGenre] = useState("all");
  const [language, setLanguage] = useState(defaultLanguage);
  // FILTER-modal multi-select facets (Steam's checkbox groups). System pages
  // seed the variant/language defaults that used to live in the inline
  // dropdowns (Main library + English, unless overridden).
  const [genreSel, setGenreSel] = useState<string[]>([]);
  const [modeSel, setModeSel] = useState<string[]>([]);
  const [missingSel, setMissingSel] = useState<string[]>([]);
  const [platformSel, setPlatformSel] = useState<string[]>([]);
  const [variantSel, setVariantSel] = useState<string[]>(
    platformLock && defaultVariant !== "all" ? [defaultVariant] : []
  );
  const [langSel, setLangSel] = useState<string[]>(
    platformLock && defaultLanguage !== "all" ? [defaultLanguage] : []
  );
  // "Save as Dynamic Collection" name prompt
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const [limit, setLimit] = useState(CHUNK);
  // Filters persist while you stay in this browse area — including a round-trip
  // into a game's detail page — but reset to empty when you enter fresh from
  // home, another core area, or settings. We tell the two apart by the path we
  // arrived from: only a game detail (/game/…) counts as "still browsing".
  const storageKey = `gh-browse:${
    platformLock ??
    (collectionLock
      ? `collection-${collectionLock}`
      : virtualLock
        ? `virtual-${virtualLock.dim}-${virtualLock.value}`
        : "library")
  }`;
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const from = previousPath();
    const cameFromDetail = !!from && /^\/game\//.test(from);
    if (!cameFromDetail) {
      // fresh entry into this area → start with empty (default) filters
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
      setRestored(true);
      return;
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (saved && typeof saved === "object") {
        if (typeof saved.tab === "string") setTab(saved.tab);
        if (typeof saved.collection === "string") setCollection(saved.collection);
        if (typeof saved.sort === "string") setSort(saved.sort);
        // In chrome mode the header search owns the query; don't restore it
        // here or the grid would filter while the header box shows empty.
        if (!chromeMode && typeof saved.query === "string") {
          setQuery(saved.query);
          setDebouncedQuery(saved.query.trim().toLowerCase());
        }
        if (typeof saved.platform === "string") setPlatform(saved.platform);
        if (typeof saved.variant === "string") setVariant(saved.variant);
        if (typeof saved.genre === "string") setGenre(saved.genre);
        if (typeof saved.language === "string") setLanguage(saved.language);
        const strArr = (v: unknown) =>
          Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
        const gs = strArr(saved.genreSel);
        if (gs) setGenreSel(gs);
        const ms = strArr(saved.modeSel);
        if (ms) setModeSel(ms);
        const mis = strArr(saved.missingSel);
        if (mis) setMissingSel(mis);
        const ps = strArr(saved.platformSel);
        if (ps) setPlatformSel(ps);
        const vs = strArr(saved.variantSel);
        if (vs) setVariantSel(vs);
        const ls = strArr(saved.langSel);
        if (ls) setLangSel(ls);
      }
    } catch {}
    setRestored(true);
  }, [storageKey, chromeMode]);
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          tab, collection, sort, query, platform, variant, genre, language,
          genreSel, modeSel, missingSel, platformSel, variantSel, langSel,
        })
      );
    } catch {}
  }, [
    restored, storageKey, tab, collection, sort, query, platform, variant, genre, language,
    genreSel, modeSel, missingSel, platformSel, variantSel, langSel,
  ]);
  const [items, setItems] = useState<BrowseRomRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(remote);
  const fetchSeq = useRef(0);
  const loadingMore = useRef(false);

  // Debounce typing so remote mode doesn't query on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Collection tab strip for the library (All Games + the user's collections)
  // BPM's library tab strip: "All Games" + a single "Collections" tab (custom
  // collections live INSIDE it as cards, not as their own tabs).
  const collectionTabs = useMemo(
    () => [
      { id: "all", name: t("status.all"), count: totalGames as number | undefined },
      { id: FAVORITES, name: t("status.favorites"), count: favoritesCount as number | undefined },
      { id: SHELVES, name: t("collectionsTab"), count: collections.length as number | undefined },
    ],
    [collections.length, totalGames, favoritesCount]
  );
  const currentCollection = collections.find((c) => String(c.id) === collection);

  // L1/R1 cycle: collections on the library, play-status pills on local grids.
  // System pages have no visible tab strip (play-status lives in the FILTER
  // modal), so the bumpers stay inert there.
  useEffect(() => {
    if (chromeMode && !libraryMode) return;
    const cycle = (delta: number) => () => {
      if (libraryMode) {
        setCollection((cur) => {
          const ids = collectionTabs.map((t) => t.id);
          const i = ids.indexOf(cur);
          return ids[(i + delta + ids.length) % ids.length];
        });
      } else {
        setTab((cur) => {
          const i = STATUS.findIndex((t) => t.key === cur);
          return STATUS[(i + delta + STATUS.length) % STATUS.length].key;
        });
      }
    };
    const prev = cycle(-1);
    const next = cycle(1);
    window.addEventListener("gh-lb", prev);
    window.addEventListener("gh-rb", next);
    return () => {
      window.removeEventListener("gh-lb", prev);
      window.removeEventListener("gh-rb", next);
    };
  }, [chromeMode, libraryMode, collectionTabs]);

  // Search lives in the top header (SystemBar) and FILTER/SORT in the footer
  // legend; both drive us by events so the chrome stays decoupled.
  useEffect(() => {
    if (!chromeMode) return;
    const onQuery = (e: Event) => setQuery((e as CustomEvent<string>).detail ?? "");
    const onFilter = () => {
      playSound("modalOpen");
      setFilterOpen(true);
    };
    const onSort = () => {
      playSound("modalOpen");
      setSortOpen(true);
    };
    window.addEventListener("gh-library-query", onQuery);
    window.addEventListener("gh-library-filter", onFilter);
    window.addEventListener("gh-library-sort", onSort);
    return () => {
      window.removeEventListener("gh-library-query", onQuery);
      window.removeEventListener("gh-library-filter", onFilter);
      window.removeEventListener("gh-library-sort", onSort);
    };
  }, [chromeMode]);

  // Back (B / footer) inside a collection returns to the Collections cards
  // rather than leaving the library. goBackSmart's gh-b is cancelable — we
  // consume it so it doesn't also navigate. Modals handle their own B first.
  useEffect(() => {
    if (!libraryMode) return;
    const onB = (e: Event) => {
      if (filterOpen || sortOpen || saveOpen) return;
      if (collection !== "all" && collection !== SHELVES && collection !== FAVORITES) {
        e.preventDefault();
        playSound("back");
        setCollection(SHELVES);
      }
    };
    window.addEventListener("gh-b", onB);
    return () => window.removeEventListener("gh-b", onB);
  }, [libraryMode, collection, filterOpen, sortOpen, saveOpen]);

  const buildParams = useCallback(
    (offset: number) => {
      const p = new URLSearchParams();
      if (debouncedQuery) p.set("q", debouncedQuery);
      // The Favorites tab is a play-status filter; a real collection sets its id.
      const status = collection === FAVORITES ? "favorites" : tab;
      if (status !== "all") p.set("tab", status);
      // Collection pages pin the id via the lock; otherwise the tab strip's
      // selected collection (if any) drives it.
      const effCollection =
        collectionLock ??
        (collection !== "all" && collection !== FAVORITES && collection !== SHELVES
          ? collection
          : null);
      if (effCollection) p.set("collection", effCollection);
      if (virtualLock) {
        p.set("virtualDim", virtualLock.dim);
        p.set("virtualValue", virtualLock.value);
      }
      if (sort !== "name") p.set("sort", sort);
      if (chromeMode) {
        // Steam-style checkbox groups → comma-joined (each matches ANY server-side).
        // System pages pin the platform via the lock instead of the System group.
        if (platformLock) p.set("platform", platformLock);
        else if (platformSel.length) p.set("platform", platformSel.join(","));
        if (variantSel.length) p.set("variant", variantSel.join(","));
        if (genreSel.length) p.set("genre", genreSel.join(","));
        if (modeSel.length) p.set("modes", modeSel.join(","));
        if (missingSel.length) p.set("missing", missingSel.join(","));
        if (langSel.length) p.set("language", langSel.join(","));
      } else {
        // Local grids: single-select dropdowns (platform pinned by lock)
        const effPlatform = platformLock ?? (platform !== "all" ? platform : "");
        if (effPlatform) p.set("platform", effPlatform);
        if (variant !== "all") p.set("variant", variant);
        if (genre !== "all") p.set("genre", genre);
        if (language !== "all") p.set("language", language);
      }
      p.set("offset", String(offset));
      p.set("limit", String(CHUNK));
      return p;
    },
    [
      debouncedQuery, tab, collection, sort, chromeMode, platformLock, collectionLock, virtualLock,
      platform, variant, genre, language,
      platformSel, variantSel, genreSel, modeSel, missingSel, langSel,
    ]
  );

  // Remote: reload from page 0 whenever a filter changes (after any saved
  // filters have been restored, so we don't fetch twice on mount)
  // Typing a search while in the Collections view drops back to the grid
  useEffect(() => {
    if (collection === SHELVES && debouncedQuery) setCollection("all");
  }, [collection, debouncedQuery]);

  useEffect(() => {
    if (!remote || !restored) return;
    if (collection === SHELVES) {
      // Shelves fetch their own previews; skip the grid query entirely
      setLoading(false);
      return;
    }
    const seq = ++fetchSeq.current;
    setLoading(true);
    fetch(`/api/library?${buildParams(0)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (seq !== fetchSeq.current) return;
        setItems(d.rows ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => {})
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  }, [remote, restored, buildParams, collection]);

  // Local: changing any filter starts a fresh window
  useEffect(() => {
    setLimit(CHUNK);
  }, [tab, debouncedQuery, platform, variant, genre, language]);

  const presentPlatforms = useMemo(() => {
    const slugs = remote ? new Set(platforms) : new Set(local.map((r) => r.platform_slug));
    return PLATFORMS_SORTED.filter((p) => slugs.has(p.slug));
  }, [remote, platforms, local]);

  const presentVariants = useMemo(() => {
    if (remote) return variants;
    const found = new Set<string>();
    for (const r of local) if (r.variant) found.add(r.variant);
    return [...found].sort();
  }, [remote, variants, local]);

  const filtered = useMemo(() => {
    if (remote) return [];
    return local.filter((r) => {
      if (tab === "hidden") {
        if (r.hidden !== 1) return false;
      } else if (r.hidden === 1) return false;
      if (tab === "favorites" && r.favorite !== 1) return false;
      if (tab !== "all" && tab !== "favorites" && tab !== "hidden" && r.play_status !== tab)
        return false;
      if (platform !== "all" && r.platform_slug !== platform) return false;
      if (variant === "main" && r.variant) return false;
      if (variant !== "all" && variant !== "main" && r.variant !== variant) return false;
      if (debouncedQuery && !r.title.toLowerCase().includes(debouncedQuery)) return false;
      return true;
    });
  }, [remote, local, tab, debouncedQuery, platform, variant]);

  const displayed = remote ? items : filtered.slice(0, limit);
  const totalCount = remote ? total : filtered.length;
  const hasMore = displayed.length < totalCount;

  const loadMore = useCallback(async () => {
    if (!remote) {
      setLimit((l) => l + CHUNK);
      return;
    }
    if (loadingMore.current) return;
    loadingMore.current = true;
    const seq = fetchSeq.current;
    try {
      const res = await fetch(`/api/library?${buildParams(items.length)}`, {
        cache: "no-store",
      });
      const d = await res.json();
      if (seq === fetchSeq.current) {
        setItems((cur) => [...cur, ...(d.rows ?? [])]);
        setTotal(d.total ?? 0);
      }
    } catch {
    } finally {
      loadingMore.current = false;
    }
  }, [remote, buildParams, items.length]);

  // Refetch everything currently loaded, in place — fired (gh-library-refetch)
  // while a scrape runs so covers pop in as each game is matched
  const itemsLen = useRef(0);
  useEffect(() => {
    itemsLen.current = items.length;
  }, [items.length]);
  const refetchLoaded = useCallback(async () => {
    if (!remote) return;
    const want = Math.max(itemsLen.current, CHUNK);
    const seq = ++fetchSeq.current; // cancels any in-flight pagination
    const rows: BrowseRomRow[] = [];
    let tot = 0;
    try {
      for (let off = 0; off < want; off += CHUNK) {
        const res = await fetch(`/api/library?${buildParams(off)}`, { cache: "no-store" });
        const d = await res.json();
        if (seq !== fetchSeq.current) return;
        rows.push(...(d.rows ?? []));
        tot = d.total ?? 0;
        if (rows.length >= tot) break;
      }
      setItems(rows);
      setTotal(tot);
    } catch {}
  }, [remote, buildParams]);
  const refetchRef = useRef(refetchLoaded);
  useEffect(() => {
    refetchRef.current = refetchLoaded;
  }, [refetchLoaded]);
  useEffect(() => {
    const onRefetch = () => void refetchRef.current();
    window.addEventListener("gh-library-refetch", onRefetch);
    return () => window.removeEventListener("gh-library-refetch", onRefetch);
  }, []);

  // Self-contained live refresh: while a scrape job covering this view runs,
  // refetch the loaded grid on every progress tick so covers pop in as games
  // are matched. Polls the job endpoint directly — no cross-component wiring.
  const lastJobDone = useRef(-1);
  useEffect(() => {
    if (!remote) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function tick() {
      try {
        const res = await fetch("/api/scrape/job", { cache: "no-store" });
        const j = await res.json();
        if (stop) return;
        const coversThis =
          !platformLock || j.systems === null || (j.systems ?? []).includes(platformLock);
        if (j.running && coversThis) {
          if (j.done !== lastJobDone.current) {
            lastJobDone.current = j.done;
            void refetchRef.current();
          }
        } else if (lastJobDone.current !== -1) {
          // Job just finished — one final refresh picks up the last covers
          lastJobDone.current = -1;
          void refetchRef.current();
        }
      } catch {}
      if (!stop) timer = setTimeout(tick, 2500);
    }
    tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [remote, platformLock]);

  // Sentinel near the bottom streams in the next batch
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);
  const observer = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMoreRef.current();
      },
      { rootMargin: "1200px" }
    );
    observer.current.observe(node);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  // Count of active filters (drives the FILTER chip / empty-state hint)
  const activeFilters = chromeMode
    ? (tab !== "all" ? 1 : 0) +
      platformSel.length +
      variantSel.length +
      genreSel.length +
      modeSel.length +
      missingSel.length +
      langSel.length
    : (tab !== "all" ? 1 : 0) +
      (platform !== "all" ? 1 : 0) +
      (variant !== "all" ? 1 : 0) +
      (genre !== "all" ? 1 : 0) +
      (language !== "all" ? 1 : 0);
  const clearFilters = () => {
    setTab("all");
    setPlatform("all");
    setVariant("all");
    setGenre("all");
    setLanguage("all");
    setGenreSel([]);
    setModeSel([]);
    setMissingSel([]);
    setPlatformSel([]);
    setVariantSel([]);
    setLangSel([]);
  };
  const toggleIn = (set: React.Dispatch<React.SetStateAction<string[]>>, v: string) =>
    set((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  // "Save as Dynamic Collection" — turn the current filters into a smart
  // collection (membership stays in sync via the same SmartFilters engine).
  const buildSmartFilters = () => {
    const f: Record<string, unknown> = {};
    if (platformSel.length) f.platforms = platformSel;
    if (genreSel.length) {
      f.genres = genreSel;
      f.genres_logic = "any";
    }
    if (langSel.length) {
      f.languages = langSel;
      f.languages_logic = "any";
    }
    if (variantSel.length) f.variants = variantSel;
    if (modeSel.length) f.game_modes = modeSel;
    // Show radio → smart "statuses" (only the play-status views map cleanly)
    if (["playing", "backlog", "beaten"].includes(tab)) f.statuses = [tab];
    return f;
  };
  const suggestedName = () => {
    const bits = [...platformSel, ...genreSel, ...modeSel];
    return bits.length ? bits.slice(0, 3).join(" · ") : t("filteredGamesDefault");
  };
  const openSave = () => {
    setSaveName(suggestedName());
    setSaveOpen(true);
  };
  const saveCollection = async () => {
    const filters = buildSmartFilters();
    if (!saveName.trim() || Object.keys(filters).length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim(), isSmart: true, filters }),
      });
      if (res.ok) {
        playSound("activate");
        setSaveOpen(false);
        setFilterOpen(false);
        router.refresh(); // new collection appears in the tab strip
      }
    } catch {
    } finally {
      setSaving(false);
    }
  };
  // "N apps hidden due to filter" — the active collection's full size minus
  // what the filters left showing (Steam's semantics).
  const activeCollectionCount =
    collectionTabs.find((c) => c.id === collection)?.count ??
    currentCollection?.count ??
    totalGames ??
    total;
  const hiddenCount = Math.max(0, (activeCollectionCount ?? total) - total);

  // Tell the footer how many filters are active so its FILTER chip can show an
  // indicator; clear it when we leave the page.
  useEffect(() => {
    if (!chromeMode) return;
    window.dispatchEvent(new CustomEvent("gh-library-filter-active", { detail: activeFilters }));
  }, [chromeMode, activeFilters]);
  useEffect(
    () => () => {
      window.dispatchEvent(new CustomEvent("gh-library-filter-active", { detail: 0 }));
    },
    []
  );

  return (
    <div>
      {libraryMode ? (
        // Library: centered collection tabs flanked by L1/R1 bumpers. Search,
        // Filter (X) and Sort (Y) live in the header/footer chrome.
        <div className="gamepadtabbedpage_TabHeaderRowWrapper_gh relative flex items-center justify-center py-1">
          <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2">
            <Bumper label="L1" />
          </span>
          <div className="flex max-w-[calc(100%-120px)] flex-wrap items-center justify-center gap-[2px]">
            {collectionTabs.map((c) => (
              <GpPill
                key={c.id}
                // "Collections" stays active while you're inside any collection
                active={
                  c.id === SHELVES
                    ? collection !== "all" && collection !== FAVORITES
                    : collection === c.id
                }
                onClick={() => setCollection(c.id)}
                count={c.count}
              >
                {c.name}
              </GpPill>
            ))}
          </div>
          <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2">
            <Bumper label="R1" />
          </span>
        </div>
      ) : chromeMode ? (
        // System pages: search is in the header, FILTER/SORT in the footer —
        // no inline row (matches the full library).
        null
      ) : (
        // Local grids: play-status pill tabs + inline filter dropdowns
        <div className="gamepadtabbedpage_TabHeaderRowWrapper_gh mb-4 flex flex-wrap items-center gap-[2px] py-3">
          {STATUS.map((s) => (
            <GpPill key={s.key} active={tab === s.key} onClick={() => setTab(s.key)}>
              {t(`status.${s.key}`)}
            </GpPill>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {!hidePlatformFilter && (
              <GpDropdown
                value={platform}
                width={170}
                onChange={setPlatform}
                options={[
                  { value: "all", label: t("allSystems") },
                  ...presentPlatforms.map((p) => ({ value: p.slug, label: p.name })),
                ]}
              />
            )}
            {presentVariants.length > 0 && (
              <GpDropdown
                value={variant}
                width={150}
                onChange={setVariant}
                options={[
                  { value: "all", label: t("allVariants") },
                  { value: "main", label: t("mainLibrary") },
                  ...presentVariants.map((v) => ({ value: v, label: v })),
                ]}
              />
            )}
            {genres.length > 0 && (
              <GpDropdown
                value={genre}
                width={150}
                onChange={setGenre}
                options={[
                  { value: "all", label: t("allGenres") },
                  ...genres.map((g) => ({ value: g, label: g })),
                ]}
              />
            )}
            {languages.length > 0 && (
              <GpDropdown
                value={language}
                width={160}
                onChange={setLanguage}
                options={[
                  { value: "all", label: t("allLanguages") },
                  ...[...languages]
                    .sort((a, b) => (LANGUAGE_NAMES[a] ?? a).localeCompare(LANGUAGE_NAMES[b] ?? b))
                    .map((l) => ({ value: l, label: LANGUAGE_NAMES[l] ?? l })),
                ]}
              />
            )}
            {tools}
            <input
              className="searchbar_SearchBox_gh searchbar_SearchFieldBackground_gh input-dark w-52 rounded-[2px] px-3 py-2 text-sm"
              placeholder={t("searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="text-xs text-dim">{loading ? "…" : totalCount.toLocaleString()}</span>
          </div>
        </div>
      )}

      {libraryMode && collection === SHELVES ? (
        // Collections view: one shelf of covers per collection
        <CollectionShelves
          collections={collections}
          onOpen={(id) => {
            playSound("tab");
            setCollection(id);
          }}
        />
      ) : (
        <>
          {/* Inside a specific collection: show its name (the Collections tab
              handles going back). */}
          {libraryMode &&
            collection !== "all" &&
            collection !== SHELVES &&
            collection !== FAVORITES && (
              <div className="mb-2 mt-1">
                <span className="text-[20px] font-semibold text-bright">
                  {currentCollection?.name ?? t("collectionFallback")}
                </span>
              </div>
            )}
          {/* When the FILTER modal narrows the view, Steam draws a rule above the
              grid: "N APPS HIDDEN DUE TO FILTER" with a clear (X) button. Exact BPM
              class names/structure so themes can restyle it. */}
          {chromeMode && activeFilters > 0 && (
            <div className="gamepadlibrary_AppGridFilterHeader_gh mt-3">
              <span className="gamepadlibrary_AppGridFilterText_gh">
                {t("appsHiddenDueToFilter", { count: hiddenCount })}
                <button
                  onClick={clearFilters}
                  aria-label={t("clearFiltersLabel")}
                  className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white/15 text-[10px] leading-none text-white transition-colors hover:bg-white/25"
                >
                  ✕
                </button>
              </span>
            </div>
          )}

          {displayed.length === 0 ? (
            <p className="py-16 text-center text-dim">
              {loading
                ? t("loading")
                : collection === FAVORITES
                  ? t("noFavorites")
                  : remote && (debouncedQuery || activeFilters || collection !== "all")
                    ? t("noMatch")
                    : t("noGames")}
            </p>
          ) : (
            <>
              <VirtualGrid
                roms={displayed}
                sizeMode={platformLock ? "natural" : "uniform"}
                footprintLayout={
                  platformLock ? (boxLayout ?? boxLayoutForSlug(platformLock)) : "portrait"
                }
                systemIcons={systemIcons}
              />
              {hasMore && (
                <div ref={sentinelRef} className="py-8 text-center text-xs text-dim">
                  {t("showingCount", {
                    shown: displayed.length.toLocaleString(),
                    total: totalCount.toLocaleString(),
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {chromeMode && filterOpen && (
        <GpFilterDialog
          title={platformLock || collectionLock || virtualLock ? t("filterGames") : t("filterLibrary")}
          subtitle={
            platformLock
              ? t("subtitleSystem")
              : collectionLock || virtualLock
                ? t("subtitleCollection")
                : t("subtitleLibrary")
          }
          onClose={() => setFilterOpen(false)}
          headerAction={
            activeFilters > 0 ? (
              <button
                onClick={clearFilters}
                className="cursor-pointer text-[13px] font-bold uppercase tracking-wide text-accent hover:text-bright"
              >
                {t("clearAll")}
              </button>
            ) : null
          }
        >
          <GpFilterSection label={t("sectionShow")}>
            {STATUS.map((s) => (
              <GpRadioRow
                key={s.key}
                selected={tab === s.key}
                onSelect={() => setTab(s.key)}
                label={t(`status.${s.key}`)}
              />
            ))}
          </GpFilterSection>

          {!platformLock && presentPlatforms.length > 0 && (
            <GpFilterSection label={t("sectionSystem")}>
              {presentPlatforms.map((p) => (
                <GpCheck
                  key={p.slug}
                  checked={platformSel.includes(p.slug)}
                  onChange={() => toggleIn(setPlatformSel, p.slug)}
                  label={p.name}
                />
              ))}
            </GpFilterSection>
          )}

          <GpFilterSection label={t("sectionPlayers")}>
            {MODES.map((m) => (
              <GpCheck
                key={m}
                checked={modeSel.includes(m)}
                onChange={() => toggleIn(setModeSel, m)}
                label={m}
              />
            ))}
          </GpFilterSection>

          <GpFilterSection label={t("sectionMissing")}>
            {MISSING.map((m) => (
              <GpCheck
                key={m.key}
                checked={missingSel.includes(m.key)}
                onChange={() => toggleIn(setMissingSel, m.key)}
                label={t(`missing.${m.key}`)}
              />
            ))}
          </GpFilterSection>

          {genres.length > 0 && (
            <GpFilterSection label={t("sectionGenre")}>
              {genres.map((g) => (
                <GpCheck
                  key={g}
                  checked={genreSel.includes(g)}
                  onChange={() => toggleIn(setGenreSel, g)}
                  label={g}
                />
              ))}
            </GpFilterSection>
          )}

          {presentVariants.length > 0 && (
            <GpFilterSection label={t("sectionVariant")}>
              <GpCheck
                checked={variantSel.includes("main")}
                onChange={() => toggleIn(setVariantSel, "main")}
                label={t("mainLibrary")}
              />
              {presentVariants.map((v) => (
                <GpCheck
                  key={v}
                  checked={variantSel.includes(v)}
                  onChange={() => toggleIn(setVariantSel, v)}
                  label={v}
                />
              ))}
            </GpFilterSection>
          )}

          {languages.length > 0 && (
            <GpFilterSection label={t("sectionLanguage")}>
              {[...languages]
                .sort((a, b) => (LANGUAGE_NAMES[a] ?? a).localeCompare(LANGUAGE_NAMES[b] ?? b))
                .map((l) => (
                  <GpCheck
                    key={l}
                    checked={langSel.includes(l)}
                    onChange={() => toggleIn(setLangSel, l)}
                    label={LANGUAGE_NAMES[l] ?? l}
                  />
                ))}
            </GpFilterSection>
          )}

          {/* Footer actions (reference: appfilterpane Reset / Save buttons).
              "Save as Dynamic Collection" is library-only — a smart collection
              filters the whole library, so it can't capture a system lock. */}
          <div className="mt-1 flex items-center justify-between gap-3">
            <GpButton
              onClick={clearFilters}
              disabled={activeFilters === 0}
              className="appfilterpane_ClearButton_gh"
            >
              {t("reset")}
            </GpButton>
            {!platformLock && (
              <GpButton
                primary
                onClick={openSave}
                disabled={activeFilters === 0}
                className="appfilterpane_SaveButton_gh"
              >
                {t("saveAsDynamic")}
              </GpButton>
            )}
          </div>
        </GpFilterDialog>
      )}

      {libraryMode && saveOpen && (
        <GpModal
          title={t("saveModalTitle")}
          width={460}
          onClose={() => setSaveOpen(false)}
          footer={
            <>
              <GpButton onClick={() => setSaveOpen(false)}>{t("cancel")}</GpButton>
              <GpButton primary onClick={saveCollection} disabled={saving || !saveName.trim()}>
                {saving ? t("creating") : t("create")}
              </GpButton>
            </>
          }
        >
          <p className="mb-3 text-[14px] leading-relaxed text-dim">
            {t("saveModalDesc")}
          </p>
          <input
            autoFocus
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveCollection();
            }}
            placeholder={t("collectionNamePlaceholder")}
            className="w-full rounded-[2px] bg-white/15 px-4 py-[10px] text-[16px] text-[#dcdedf] outline-none placeholder:text-white/40 focus:bg-white/20"
          />
        </GpModal>
      )}

      {chromeMode && sortOpen && (
        <GpModal title={t("sortByTitle")} width={420} onClose={() => setSortOpen(false)}>
          <div role="listbox" className="-mx-2">
            {SORTS.map((s) => (
              <button
                key={s.key}
                role="option"
                aria-selected={sort === s.key}
                onClick={() => {
                  playSound("activate");
                  setSort(s.key);
                  setSortOpen(false);
                }}
                // DialogButton hook so theme fullscreen-modal button rules apply
                className={`gamepaddialog_Button_gh DialogButton flex min-h-12 w-full cursor-pointer items-center justify-between px-5 py-2 text-left text-[16px] ${
                  sort === s.key
                    ? "gamepaddialog_Selected_gh bg-[#3d4450] text-white"
                    : "text-[#b8bcbf] hover:bg-[#3d4450] hover:text-white"
                }`}
              >
                <span>{t(`sort.${s.key}`)}</span>
                {sort === s.key && <span className="text-[13px]">✓</span>}
              </button>
            ))}
          </div>
        </GpModal>
      )}
    </div>
  );
}

// Column/row gaps. The uniform library grid matches Steam's measured pitch
// (172+45 = 217 across, 258+42 = 300 down); system-page natural grids stay
// tighter since their capsules vary in shape.
const GAP_Y = 42;

/** Windowed capsule grid — only the visible rows exist in the DOM, so a
 *  31k-game library scrolls like Steam's (which virtualizes with the same
 *  library, per its Third-Party Licenses). Row packing is computed from the
 *  cards' fixed footprints; every card in one view shares a footprint
 *  (uniform grids by definition, system pages by platform). */
function VirtualGrid({
  roms,
  sizeMode,
  footprintLayout,
  systemIcons,
}: {
  roms: BrowseRomRow[];
  sizeMode: "natural" | "uniform";
  footprintLayout: BoxLayout;
  systemIcons?: Record<string, string | null>;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [gridW, setGridW] = useState(0);
  const [sm, setSm] = useState(true);
  const [offsetTop, setOffsetTop] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      setGridW(el.clientWidth);
      setSm(window.innerWidth >= 640);
      setOffsetTop(el.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const fp = cardFootprint(footprintLayout, sizeMode, sm);
  const gapX = sizeMode === "uniform" ? 45 : 16;
  const cols = Math.max(1, Math.floor((gridW + gapX) / (fp.w + gapX)));
  const rowCount = Math.ceil(roms.length / cols);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => fp.h + GAP_Y,
    overscan: 4,
    scrollMargin: offsetTop,
  });

  return (
    <div ref={wrap} className="gamepadlibrary_GamepadLibrary_gh appgrid_Container_gh relative mt-4">
      {gridW > 0 && (
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              className="absolute inset-x-0 flex"
              style={{
                transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
                columnGap: gapX,
              }}
            >
              {roms.slice(row.index * cols, (row.index + 1) * cols).map((rom) => (
                <GameCard
                  key={rom.id}
                  rom={rom}
                  size={sizeMode}
                  systemIcon={systemIcons?.[rom.platform_slug] ?? null}
                  showSystem={!!systemIcons}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
