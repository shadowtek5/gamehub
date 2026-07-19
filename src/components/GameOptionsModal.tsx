"use client";

import { GpProgress } from "@/components/bpm/primitives";

// SteamOS game options modal (the ⚙ button on a game page):
// centered dark panel — Add to Favorites / Add to > / Manage > /
// Properties… / Cancel — over a dimmed, blurred backdrop.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScrapeOutcome } from "@/lib/providers/scrape";
import RomPatcherModal from "./RomPatcherModal";
import {
  GScrape, GBackfill, GTarget, GBoxArt, GHeroArt, GPencil, GFilm, GBook,
  GDownload, GBandage,
} from "./menuGlyphs";
import { playSound } from "@/lib/sounds";
import { useTranslations } from "next-intl";
import { useOpProgress } from "@/lib/useOpProgress";
import DownloadProgressModal from "./DownloadProgressModal";

interface CollectionOpt {
  id: number;
  name: string;
  hasRom: boolean;
}

/** Per-game media fetches with the centered FTP-progress window */
type FetchKind = "video" | "manual";

const ROW =
  "block w-full cursor-pointer bg-[#23282e] px-6 py-3.5 text-left text-[15px] text-body hover:bg-[#2d333b] hover:text-bright focus:bg-[#2d333b] focus:text-bright focus:outline-none";

const SUB_ROW =
  "flex w-full cursor-pointer items-center gap-3 bg-[#23282e] px-5 py-2.5 text-left text-sm text-body hover:bg-[#2d333b] hover:text-bright focus:bg-[#2d333b] focus:text-bright focus:outline-none";

const SUB_HEADER =
  "bg-[#1c2127] px-5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-dim";

export default function GameOptionsModal({
  romId,
  title,
  filename = "",
  favorite: initialFavorite,
  isAdmin,
  hidden: initialHidden = false,
  heroPlain: initialHeroPlain = false,
  collections: initialCollections,
  hasManual = false,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: {
  romId: number;
  title: string;
  filename?: string;
  favorite: boolean;
  isAdmin: boolean;
  hidden?: boolean;
  /** Per-user "art only" hero: hide the logo/title overlaid on game details. */
  heroPlain?: boolean;
  collections: CollectionOpt[];
  hasManual?: boolean;
  /** Controlled open state (opened as a per-card context menu from a grid). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hide the built-in ⚙ button (when opened externally) */
  hideTrigger?: boolean;
}) {
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? openProp! : internalOpen;
  const setOpen = useCallback(
    (v: boolean) => {
      onOpenChange?.(v);
      if (!isControlled) setInternalOpen(v);
    },
    [isControlled, onOpenChange]
  );
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  const [favorite, setFavorite] = useState(initialFavorite);
  const [hidden, setHidden] = useState(initialHidden);
  const [heroPlain, setHeroPlain] = useState(initialHeroPlain);
  const [patcherOpen, setPatcherOpen] = useState(false);
  const [collections, setCollections] = useState(initialCollections);
  const [expand, setExpand] = useState<"none" | "addto" | "manage">("none");
  const [scrapeMsg, setScrapeMsg] = useState("");
  const [videoJob, setVideoJob] = useState<
    | null
    | { state: "working"; kind: FetchKind; phase: string; bytes: number; total: number }
    | { state: "done"; kind: FetchKind; ok: boolean; msg: string }
  >(null);
  const [view, setView] = useState<"menu" | "hero" | "boxart" | "logo" | "match" | "newcollection">("menu");
  // Guard against double-clicking an artwork candidate (fires the change twice).
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false);
  // Hide candidates whose image 404s (e.g. libretro thumbnails that don't exist).
  const [brokenArt, setBrokenArt] = useState<Record<string, true>>({});
  const markBrokenArt = (url: string) => setBrokenArt((b) => (b[url] ? b : { ...b, [url]: true }));
  const [logoCandidates, setLogoCandidates] = useState<{ url: string; provider: string }[] | null>(null);
  const [logoMsg, setLogoMsg] = useState("");
  const [newCollName, setNewCollName] = useState("");
  const [newCollMsg, setNewCollMsg] = useState("");
  const [newCollBusy, setNewCollBusy] = useState(false);
  const [heroCandidates, setHeroCandidates] = useState<
    { url: string; provider: string }[] | null
  >(null);
  const [heroMsg, setHeroMsg] = useState("");
  const [boxCandidates, setBoxCandidates] = useState<
    { url: string; provider: string }[] | null
  >(null);
  const [boxMsg, setBoxMsg] = useState("");
  const [matchQuery, setMatchQuery] = useState("");
  const [matchResults, setMatchResults] = useState<
    | { provider: string; id: number; title: string; system?: string; year?: string }[]
    | null
  >(null);
  const [matchMsg, setMatchMsg] = useState("");
  const [matchBusy, setMatchBusy] = useState(false);
  const firstRow = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const t = useTranslations("gameOptions");
  const td = useTranslations("downloadProgress");
  const { job: dlJob, run: runDl } = useOpProgress();

  useEffect(() => {
    const onB = (e: Event) => {
      if (openRef.current) {
        e.preventDefault();
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openRef.current) {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    // the Play button's dropdown chevron opens this same modal (Steam's
    // play-options dropdown), via a window event
    const onOpen = () => {
      playSound("modalOpen");
      setOpen(true);
    };
    window.addEventListener("gh-b", onB);
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("gh-open-game-options", onOpen);
    return () => {
      window.removeEventListener("gh-b", onB);
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("gh-open-game-options", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setExpand("none");
      setScrapeMsg("");
      setView("menu");
      setHeroMsg("");
      firstRow.current?.focus();
    }
  }, [open]);

  async function openHeroPicker() {
    setView("hero");
    setHeroCandidates(null);
    setHeroMsg(t("searchingProviders"));
    try {
      const res = await fetch(`/api/roms/${romId}/hero-candidates`);
      const data = await res.json();
      setHeroCandidates(data.candidates ?? []);
      setHeroMsg(
        (data.candidates ?? []).length === 0
          ? `${t("noCandidates")}${data.errors?.length ? ` — ${data.errors.join("; ")}` : ` — ${t("configureProvidersHero")}`}`
          : ""
      );
    } catch (e) {
      setHeroMsg(`✗ ${e instanceof Error ? e.message : e}`);
    }
  }

  async function pickHero(url: string | null) {
    if (pickingRef.current) return;
    pickingRef.current = true;
    setPicking(true);
    setHeroMsg(url ? t("downloading") : t("clearing"));
    try {
      const doFetch = () =>
        fetch(`/api/roms/${romId}/hero`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
      const res =
        url && /^https?:\/\//i.test(url)
          ? await runDl({ title: td("artTitle"), subtitle: title, pollUrl: `/api/roms/${romId}/hero`, work: doFetch })
          : await doFetch();
      const data = await res.json();
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setHeroMsg(`✗ ${data.error ?? t("failed")}`);
      }
    } finally {
      pickingRef.current = false;
      setPicking(false);
    }
  }

  async function openBoxartPicker() {
    setView("boxart");
    setBoxCandidates(null);
    setBoxMsg(t("searchingProviders"));
    try {
      const res = await fetch(`/api/roms/${romId}/boxart-candidates`);
      const data = await res.json();
      setBoxCandidates(data.candidates ?? []);
      setBoxMsg(
        (data.candidates ?? []).length === 0
          ? `${t("noCandidates")}${data.errors?.length ? ` — ${data.errors.join("; ")}` : ""}`
          : ""
      );
    } catch (e) {
      setBoxMsg(`✗ ${e instanceof Error ? e.message : e}`);
    }
  }

  async function pickBoxart(url: string | null) {
    if (pickingRef.current) return;
    pickingRef.current = true;
    setPicking(true);
    setBoxMsg(url ? t("downloading") : t("clearing"));
    try {
      const doFetch = () =>
        fetch(`/api/roms/${romId}/boxart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
      const res =
        url && /^https?:\/\//i.test(url)
          ? await runDl({ title: td("artTitle"), subtitle: title, pollUrl: `/api/roms/${romId}/boxart`, work: doFetch })
          : await doFetch();
      const data = await res.json();
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setBoxMsg(`✗ ${data.error ?? t("failed")}`);
      }
    } finally {
      pickingRef.current = false;
      setPicking(false);
    }
  }

  async function openLogoPicker() {
    setView("logo");
    setLogoCandidates(null);
    setLogoMsg(t("searchingProviders"));
    try {
      const res = await fetch(`/api/roms/${romId}/logo-candidates`);
      const data = await res.json();
      setLogoCandidates(data.candidates ?? []);
      setLogoMsg(
        (data.candidates ?? []).length === 0
          ? `${t("noLogos")}${data.errors?.length ? ` — ${data.errors.join("; ")}` : ` — ${t("configureProvidersLogo")}`}`
          : ""
      );
    } catch (e) {
      setLogoMsg(`✗ ${e instanceof Error ? e.message : e}`);
    }
  }

  async function pickLogo(url: string | null) {
    if (pickingRef.current) return;
    pickingRef.current = true;
    setPicking(true);
    setLogoMsg(url ? t("downloading") : t("clearing"));
    try {
      const doFetch = () =>
        fetch(`/api/roms/${romId}/logo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
      const res =
        url && /^https?:\/\//i.test(url)
          ? await runDl({ title: td("artTitle"), subtitle: title, pollUrl: `/api/roms/${romId}/logo`, work: doFetch })
          : await doFetch();
      const data = await res.json();
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setLogoMsg(`✗ ${data.error ?? t("failed")}`);
      }
    } finally {
      pickingRef.current = false;
      setPicking(false);
    }
  }

  async function searchMatches(q: string) {
    setMatchBusy(true);
    setMatchMsg(t("searchingScreenscraper"));
    setMatchResults(null);
    try {
      const res = await fetch(
        `/api/roms/${romId}/match-candidates?q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      setMatchResults(data.candidates ?? []);
      setMatchMsg(
        (data.candidates ?? []).length === 0
          ? (data.error ?? t("noGamesFound"))
          : ""
      );
    } catch (e) {
      setMatchMsg(`✗ ${e instanceof Error ? e.message : e}`);
    } finally {
      setMatchBusy(false);
    }
  }

  function openMatchView() {
    setView("match");
    setMatchQuery(title);
    setMatchResults(null);
    setMatchMsg("");
    void searchMatches(title);
  }

  async function applyMatch(provider: string, gameId: number, name: string) {
    setMatchBusy(true);
    setMatchMsg(t("scrapingAs", { name }));
    try {
      const res = await fetch(`/api/roms/${romId}/rematch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, gameId }),
      });
      const outcome = await res.json();
      if (outcome.ok) {
        playSound("toast");
        setOpen(false);
        router.refresh();
      } else {
        setMatchMsg(`✗ ${outcome.error ?? t("nothingForMatch")}`);
      }
    } catch (e) {
      setMatchMsg(`✗ ${e instanceof Error ? e.message : e}`);
    } finally {
      setMatchBusy(false);
    }
  }

  async function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    await fetch(`/api/roms/${romId}/favorite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: next }),
    });
    router.refresh();
  }

  async function toggleHidden() {
    const next = !hidden;
    setHidden(next);
    playSound(next ? "toggleOff" : "toggleOn");
    await fetch(`/api/roms/${romId}/personal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: next }),
    });
    router.refresh();
  }

  async function toggleHeroPlain() {
    const next = !heroPlain;
    setHeroPlain(next);
    playSound(next ? "toggleOn" : "toggleOff");
    await fetch(`/api/roms/${romId}/personal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hero_plain: next }),
    });
    router.refresh();
  }

  async function toggleCollection(c: CollectionOpt) {
    setCollections((cur) =>
      cur.map((x) => (x.id === c.id ? { ...x, hasRom: !x.hasRom } : x))
    );
    await fetch(`/api/collections/${c.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ romId, action: c.hasRom ? "remove" : "add" }),
    });
    router.refresh();
  }

  async function createPlainCollection() {
    const name = newCollName.trim();
    if (!name || newCollBusy) return;
    setNewCollBusy(true);
    setNewCollMsg("");
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        // add this game to the freshly-created collection
        await fetch(`/api/collections/${data.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ romId, action: "add" }),
        });
        // reflect it in the menu immediately — router.refresh() alone won't
        // update this list because it's seeded from a prop via useState
        setCollections((cur) =>
          cur.some((c) => c.id === data.id)
            ? cur
            : [...cur, { id: data.id, name, hasRom: true }].sort((a, b) =>
                a.name.localeCompare(b.name)
              )
        );
        playSound("confirm");
        setOpen(false);
        router.refresh();
      } else {
        setNewCollMsg(data.error ?? t("couldntCreateCollection"));
      }
    } finally {
      setNewCollBusy(false);
    }
  }

  // Dynamic collections are filter-defined (you don't add one game to them),
  // so this hands off to the full filter builder on the Collections page.
  function createDynamicCollection() {
    playSound("confirm");
    setOpen(false);
    router.push("/collections?new=smart");
  }

  async function scrape(metadataOnly = false) {
    setScrapeMsg(t("fetching"));
    const res = await runDl({
      title: td("scrapeTitle"),
      subtitle: title,
      pollUrl: `/api/roms/${romId}/scrape`,
      work: () =>
        fetch(`/api/roms/${romId}/scrape`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(metadataOnly ? { mode: "metadata" } : {}),
        }),
    });
    const outcome: ScrapeOutcome = await res.json();
    setScrapeMsg(
      outcome.ok
        ? `✓ ${t("scrapeGot", { got: outcome.got.join(", ") || t("metadata") })}`
        : `✗ ${outcome.error ?? t("nothingFound")}`
    );
    if (outcome.ok) router.refresh();
  }

  async function fetchMedia(kind: FetchKind) {
    setOpen(false);
    setVideoJob({ state: "working", kind, phase: "searching", bytes: 0, total: 0 });

    // Poll live FTP download progress while the fetch runs
    const poller = setInterval(async () => {
      try {
        const res = await fetch(`/api/roms/${romId}/fetch-${kind}`);
        const p = await res.json();
        if (p.phase && p.phase !== "idle") {
          setVideoJob((cur) =>
            cur?.state === "working"
              ? { state: "working", kind, phase: p.phase, bytes: p.bytes ?? 0, total: p.total ?? 0 }
              : cur
          );
        }
      } catch {}
    }, 350);

    try {
      const res = await fetch(`/api/roms/${romId}/fetch-${kind}`, { method: "POST" });
      const outcome = await res.json();
      playSound(outcome.ok ? "toast" : "bumperEnd");
      setVideoJob({
        state: "done",
        kind,
        ok: !!outcome.ok,
        msg: outcome.ok ? t(`fetchLabels.${kind}.added`) : (outcome.error ?? t(`fetchLabels.${kind}.notFound`)),
      });
      if (outcome.ok) router.refresh();
      setTimeout(() => setVideoJob(null), outcome.ok ? 2000 : 4000);
    } catch (e) {
      setVideoJob({
        state: "done",
        kind,
        ok: false,
        msg: e instanceof Error ? e.message : t("fetchFailed"),
      });
      setTimeout(() => setVideoJob(null), 4000);
    } finally {
      clearInterval(poller);
    }
  }

  return (
    <>
      {!hideTrigger && (
        <button
          onClick={() => {
            playSound("modalOpen");
            setOpen(true);
          }}
          className="appdetailsplaysection_MenuButton_gh flex h-12 w-12 cursor-pointer items-center justify-center rounded-[2px] bg-[#acb2c9]/[0.14] text-body transition-colors hover:bg-[#acb2c9]/25 hover:text-bright"
          aria-label={t("gameOptionsAria")}
          title={t("optionsTitle")}
        >
          {/* Heroicons cog-6-tooth (solid) — crisp, evenly-spaced gear */}
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-[22px] w-[22px]">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"
            />
          </svg>
        </button>
      )}

      {/* Centered progress for the video snap fetch */}
      {videoJob && (
        <div className="fixed inset-0 z-[98] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="deck-backdrop relative w-[380px] rounded-[4px] bg-[#171d25] p-7 text-center shadow-2xl ring-1 ring-white/10">
            {videoJob.state === "working" ? (
              <>
                {videoJob.phase === "downloading" && videoJob.total > 0 ? (
                  <>
                    <div className="text-lg font-bold text-bright">
                      {t("downloadingMedia", { media: t(`fetchLabels.${videoJob.kind}.title`) })}
                    </div>
                    <div className="mt-1 truncate text-sm text-dim">{title}</div>
                    <GpProgress
                      value={Math.min(100, Math.round((videoJob.bytes / videoJob.total) * 100))}
                      className="mt-4"
                    />
                    <div className="mt-2 text-xs tabular-nums text-dim">
                      {(videoJob.bytes / 1048576).toFixed(1)} /{" "}
                      {(videoJob.total / 1048576).toFixed(1)} MB (
                      {Math.min(100, Math.round((videoJob.bytes / videoJob.total) * 100))}%)
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-accent" />
                    <div className="text-lg font-bold text-bright">
                      {t("fetchingMedia", { media: t(`fetchLabels.${videoJob.kind}.title`) })}
                    </div>
                    <div className="mt-1 truncate text-sm text-dim">{title}</div>
                    <div className="mt-3 text-xs text-dim">
                      {videoJob.phase === "downloading"
                        ? t("downloading")
                        : t("searchingEmuMovies")}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <div className={`mb-2 text-4xl ${videoJob.ok ? "text-[#59bf40]" : "text-danger"}`}>
                  {videoJob.ok ? "✓" : "✗"}
                </div>
                <div className="text-lg font-bold text-bright">{videoJob.msg}</div>
                {videoJob.ok && (
                  <div className="mt-1 text-sm text-dim">
                    {t(`fetchLabels.${videoJob.kind}.hint`)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <DownloadProgressModal job={dlJob} />

      {patcherOpen && (
        <RomPatcherModal
          romId={romId}
          title={title}
          filename={filename}
          onClose={() => setPatcherOpen(false)}
        />
      )}

      {open && (
        <div className="fixed inset-0 z-[96]" data-overlay="open">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${
              view === "hero" || view === "boxart" || view === "logo"
                ? "w-[820px] max-w-[92vw]"
                : view === "newcollection"
                  ? "w-[640px] max-w-[92vw]"
                  : view === "match"
                    ? "w-[560px] max-w-[92vw]"
                    : "w-[420px]"
            }`}
          >
            {view !== "newcollection" && (
              <div className="mb-4 text-center text-xl font-semibold text-bright">
                {view === "hero"
                  ? t("chooseHeroTitle", { title })
                  : view === "boxart"
                    ? t("chooseBoxartTitle", { title })
                    : view === "logo"
                      ? t("chooseLogoTitle", { title })
                      : view === "match"
                      ? t("fixMatchTitle", { title })
                      : title}
              </div>
            )}

            {view === "newcollection" && (
              <div className="rounded-[3px] bg-[#171d25] p-6 shadow-2xl">
                <h2 className="text-[22px] font-bold text-bright">{t("newCollectionTitle")}</h2>

                <label className="mt-4 block text-[11px] font-bold uppercase tracking-[0.15em] text-dim">
                  {t("enterCollectionName")}{" "}
                  <span className="text-[#d16359]">{t("required")}</span>
                </label>
                <input
                  autoFocus
                  value={newCollName}
                  maxLength={80}
                  onChange={(e) => setNewCollName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCollName.trim()) void createPlainCollection();
                  }}
                  className="input-dark mt-2 w-full rounded-[3px] px-4 py-3 text-[15px]"
                  placeholder={t("collectionNamePlaceholder")}
                />

                <div className="mt-5 text-[11px] font-bold uppercase tracking-[0.15em] text-dim">
                  {t("selectCollectionType")}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => void createPlainCollection()}
                    disabled={!newCollName.trim() || newCollBusy}
                    className="Focusable cursor-pointer rounded-[3px] bg-[#2a2f37] p-4 text-left outline-none transition-colors hover:bg-[#323944] focus:bg-[#323944] focus:ring-2 focus:ring-inset focus:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <div className="text-[15px] font-semibold text-bright">{t("createCollection")}</div>
                    <p className="mt-2 text-[13px] leading-relaxed text-dim">
                      {t("createCollectionDesc")}
                    </p>
                  </button>
                  <button
                    onClick={createDynamicCollection}
                    className="Focusable cursor-pointer rounded-[3px] bg-[#2a2f37] p-4 text-left outline-none transition-colors hover:bg-[#323944] focus:bg-[#323944] focus:ring-2 focus:ring-inset focus:ring-white/70"
                  >
                    <div className="flex items-center gap-2 text-[15px] font-semibold text-bright">
                      <span className="text-accent">⚡</span> {t("createDynamicCollection")}
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-dim">
                      {t("dynamicCollectionDesc")}
                    </p>
                  </button>
                </div>

                {newCollMsg && <p className="mt-3 text-[13px] text-danger">{newCollMsg}</p>}

                <div className="mt-4">
                  <button
                    onClick={() => setView("menu")}
                    className="btn-gray cursor-pointer px-3 py-1.5 text-xs"
                  >
                    {t("back")}
                  </button>
                </div>
              </div>
            )}

            {view === "hero" && (
              <div className="max-h-[70vh] overflow-y-auto rounded-[3px] bg-[#171d25] p-4 shadow-2xl">
                <div className="mb-3 flex items-center justify-between">
                  <button
                    onClick={() => setView("menu")}
                    className="btn-gray cursor-pointer px-3 py-1.5 text-xs"
                  >
                    {t("back")}
                  </button>
                  <button
                    onClick={() => pickHero(null)}
                    className="btn-gray cursor-pointer px-3 py-1.5 text-xs"
                  >
                    {t("removeHero")}
                  </button>
                </div>
                {heroMsg && <p className="mb-3 text-sm text-dim">{heroMsg}</p>}
                {heroCandidates && heroCandidates.length > 0 && (
                  <div className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${picking ? "pointer-events-none opacity-60" : ""}`}>
                    {heroCandidates.filter((c) => !brokenArt[c.url]).map((c, i) => (
                      <button
                        key={`${c.url}-${i}`}
                        onClick={() => pickHero(c.url)}
                        className="deck-card overflow-hidden rounded-[3px] bg-black text-left"
                        title={c.provider}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={c.url}
                          alt={c.provider}
                          loading="lazy"
                          onError={() => markBrokenArt(c.url)}
                          className="aspect-video w-full object-cover"
                        />
                        <div className="px-2 py-1.5 text-[11px] font-semibold text-dim">
                          {c.provider}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === "boxart" && (
              <div className="max-h-[70vh] overflow-y-auto rounded-[3px] bg-[#171d25] p-4 shadow-2xl">
                <div className="mb-3 flex items-center justify-between">
                  <button
                    onClick={() => setView("menu")}
                    className="btn-gray cursor-pointer px-3 py-1.5 text-xs"
                  >
                    {t("back")}
                  </button>
                  <button
                    onClick={() => pickBoxart(null)}
                    className="btn-gray cursor-pointer px-3 py-1.5 text-xs"
                  >
                    {t("useGeneratedCover")}
                  </button>
                </div>
                {boxMsg && <p className="mb-3 text-sm text-dim">{boxMsg}</p>}
                {boxCandidates && boxCandidates.length > 0 && (
                  <div className={`grid grid-cols-3 gap-3 md:grid-cols-5 ${picking ? "pointer-events-none opacity-60" : ""}`}>
                    {boxCandidates.filter((c) => !brokenArt[c.url]).map((c, i) => (
                      <button
                        key={`${c.url}-${i}`}
                        onClick={() => pickBoxart(c.url)}
                        className="deck-card overflow-hidden rounded-[3px] bg-black text-left"
                        title={c.provider}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={c.url}
                          alt={c.provider}
                          loading="lazy"
                          onError={() => markBrokenArt(c.url)}
                          className="aspect-[3/4] w-full object-cover"
                        />
                        <div className="px-2 py-1.5 text-[11px] font-semibold text-dim">
                          {c.provider}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === "logo" && (
              <div className="max-h-[70vh] overflow-y-auto rounded-[3px] bg-[#171d25] p-4 shadow-2xl">
                <div className="mb-3 flex items-center justify-between">
                  <button
                    onClick={() => setView("menu")}
                    className="btn-gray cursor-pointer px-3 py-1.5 text-xs"
                  >
                    {t("back")}
                  </button>
                  <button
                    onClick={() => pickLogo(null)}
                    className="btn-gray cursor-pointer px-3 py-1.5 text-xs"
                  >
                    {t("removeLogo")}
                  </button>
                </div>
                {logoMsg && <p className="mb-3 text-sm text-dim">{logoMsg}</p>}
                {logoCandidates && logoCandidates.length > 0 && (
                  <div className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${picking ? "pointer-events-none opacity-60" : ""}`}>
                    {logoCandidates.filter((c) => !brokenArt[c.url]).map((c, i) => (
                      <button
                        key={`${c.url}-${i}`}
                        onClick={() => pickLogo(c.url)}
                        className="deck-card flex h-28 items-center justify-center overflow-hidden rounded-[3px] bg-black/40 p-4"
                        title={c.provider}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={c.url}
                          alt={c.provider}
                          loading="lazy"
                          onError={() => markBrokenArt(c.url)}
                          className="max-h-full max-w-full object-contain"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === "match" && (
              <div className="max-h-[70vh] overflow-y-auto rounded-[3px] bg-[#171d25] p-4 shadow-2xl">
                <div className="mb-3 flex items-center gap-2">
                  <button
                    onClick={() => setView("menu")}
                    className="btn-gray shrink-0 cursor-pointer px-3 py-1.5 text-xs"
                  >
                    {t("back")}
                  </button>
                  <input
                    className="input-dark min-w-0 flex-1 px-3 py-1.5 text-sm"
                    value={matchQuery}
                    onChange={(e) => setMatchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && matchQuery.trim()) searchMatches(matchQuery.trim());
                    }}
                    placeholder={t("gameNamePlaceholder")}
                  />
                  <button
                    onClick={() => matchQuery.trim() && searchMatches(matchQuery.trim())}
                    disabled={matchBusy}
                    className="btn-blue shrink-0 cursor-pointer px-4 py-1.5 text-sm disabled:opacity-50"
                  >
                    {t("search")}
                  </button>
                </div>
                <p className="mb-3 text-xs text-dim">
                  {t("matchHelp")}
                </p>
                {matchMsg && <p className="mb-3 text-sm text-dim">{matchMsg}</p>}
                {matchResults && matchResults.length > 0 && (
                  <div className="flex flex-col gap-[2px]">
                    {matchResults.map((m) => (
                      <button
                        key={`${m.provider}-${m.id}`}
                        onClick={() => applyMatch(m.provider, m.id, m.title)}
                        disabled={matchBusy}
                        className={`${ROW} flex items-baseline gap-3 text-sm disabled:opacity-50`}
                      >
                        <span className="min-w-0 flex-1 truncate">{m.title}</span>
                        {m.system && <span className="shrink-0 text-xs text-dim">{m.system}</span>}
                        {m.year && <span className="shrink-0 text-xs text-dim">{m.year}</span>}
                        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dim">
                          {m.provider === "screenscraper"
                            ? "SS"
                            : m.provider === "launchbox"
                              ? "LB"
                              : "IGDB"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === "menu" && (
              <>
            <div className="flex flex-col rounded-[3px] bg-[#23282e] shadow-2xl">
              <button ref={firstRow} onClick={toggleFavorite} className={ROW}>
                {favorite ? t("removeFavorite") : t("addFavorite")}
              </button>
              <button
                onClick={toggleHidden}
                className={ROW}
                title={t("hideTooltip")}
              >
                {hidden ? t("unhide") : t("hide")}
              </button>
              <button
                onClick={toggleHeroPlain}
                className={ROW}
                title={t("heroArtOnlyTooltip")}
              >
                {heroPlain ? t("heroShowInfo") : t("heroArtOnly")}
              </button>

              {/* Collections › — submenu flies out to the right, SteamOS style */}
              <div className="relative">
                <button
                  onClick={() => setExpand(expand === "addto" ? "none" : "addto")}
                  className={`${ROW} flex items-center justify-between`}
                >
                  {t("collections")} <span className="text-dim">›</span>
                </button>
                {expand === "addto" && (
                  <div className="absolute left-full top-0 ml-1.5 flex max-h-[60vh] w-[280px] flex-col overflow-y-auto rounded-[3px] shadow-2xl">
                    {/* the collection list — a seamless block like the main menu */}
                    <div className="flex flex-col rounded-[3px] bg-[#23282e]">
                      {collections.length === 0 ? (
                        <div className="px-6 py-3.5 text-sm text-dim">{t("noCollections")}</div>
                      ) : (
                        collections.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => toggleCollection(c)}
                            className={`${ROW} text-sm`}
                          >
                            {c.hasRom ? "✓ " : ""}
                            {c.name}
                          </button>
                        ))
                      )}
                    </div>
                    {/* small space, then New collection (Deck parity) */}
                    <button
                      onClick={() => {
                        setNewCollName("");
                        setNewCollMsg("");
                        setView("newcollection");
                      }}
                      className={`${ROW} mt-[2px] rounded-[3px] text-sm text-accent`}
                    >
                      {t("newCollectionItem")}
                    </button>
                  </div>
                )}
              </div>

              {/* Manage › — submenu to the right */}
              <div className="relative">
                <button
                  onClick={() => setExpand(expand === "manage" ? "none" : "manage")}
                  className={`${ROW} flex items-center justify-between`}
                >
                  {t("manage")} <span className="text-dim">›</span>
                </button>
                {expand === "manage" && (
                  <div className="absolute left-full top-0 ml-1.5 flex w-[290px] flex-col overflow-hidden rounded-[3px] shadow-2xl ring-1 ring-black/40">
                    {isAdmin && (
                      <>
                        <div className={SUB_HEADER}>{t("metadataHeader")}</div>
                        <button onClick={() => scrape()} className={SUB_ROW}>
                          <GScrape className="opacity-70" />
                          {t("scrapeMetadata")}{scrapeMsg && ` — ${scrapeMsg}`}
                        </button>
                        <button
                          onClick={() => scrape(true)}
                          className={SUB_ROW}
                          title={t("backfillTooltip")}
                        >
                          <GBackfill className="opacity-70" />
                          {t("backfillMetadata")}
                        </button>
                        <button
                          onClick={openMatchView}
                          className={SUB_ROW}
                          title={t("fixMatchTooltip")}
                        >
                          <GTarget className="opacity-70" />
                          {t("fixMatch")}
                        </button>

                        <div className={SUB_HEADER}>{t("artworkHeader")}</div>
                        <button onClick={openBoxartPicker} className={SUB_ROW}>
                          <GBoxArt className="opacity-70" />
                          {t("chooseBoxart")}
                        </button>
                        <button onClick={openHeroPicker} className={SUB_ROW}>
                          <GHeroArt className="opacity-70" />
                          {t("chooseHero")}
                        </button>
                        <button onClick={openLogoPicker} className={SUB_ROW}>
                          <GPencil className="opacity-70" />
                          {t("chooseLogo")}
                        </button>

                        <div className={SUB_HEADER}>{t("mediaHeader")}</div>
                        <button
                          onClick={() => fetchMedia("video")}
                          className={SUB_ROW}
                          title={t("fetchVideoTooltip")}
                        >
                          <GFilm className="opacity-70" />
                          {t("fetchVideoSnap")}
                        </button>
                        <button
                          onClick={() => fetchMedia("manual")}
                          className={SUB_ROW}
                          title={t("fetchManualTooltip")}
                        >
                          <GBook className="opacity-70" />
                          {t("fetchManual")}
                        </button>

                        <div className={SUB_HEADER}>{t("fileHeader")}</div>
                      </>
                    )}
                    <a href={`/api/roms/${romId}/file?download=1`} className={SUB_ROW}>
                      <GDownload className="opacity-70" />
                      {t("downloadRom")}
                    </a>
                    <button
                      onClick={() => {
                        setOpen(false);
                        playSound("modalOpen");
                        setPatcherOpen(true);
                      }}
                      className={SUB_ROW}
                      title={t("patchTooltip")}
                    >
                      <GBandage className="opacity-70" />
                      {t("patchRom")}
                    </button>
                  </div>
                )}
              </div>

              {/* Read Manual — root item, under Manage and before Properties */}
              {hasManual && (
                <button
                  onClick={() => {
                    setOpen(false);
                    window.dispatchEvent(new Event("gh-open-manual"));
                  }}
                  className={ROW}
                >
                  {t("readManual")}
                </button>
              )}
            </div>
            {isAdmin && (
              <div className="mt-[2px] overflow-hidden rounded-[3px] shadow-2xl">
                <Link
                  href={`/game/${romId}/properties`}
                  className={ROW}
                  onClick={() => setOpen(false)}
                >
                  {t("properties")}
                </Link>
              </div>
            )}
            <div className="mt-[2px] overflow-hidden rounded-[3px] shadow-2xl">
              <button onClick={() => setOpen(false)} className={ROW}>
                {t("cancel")}
              </button>
            </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
