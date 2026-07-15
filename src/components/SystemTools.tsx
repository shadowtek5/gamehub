"use client";


// The ⚙ system tools menu — same shape as a game's options modal (a centered
// dark panel with fly-out submenus and full-screen artwork picker views) but
// scoped to a whole system: rescan, scrape, artwork (hero/logo), add content,
// cleanup. Job progress lives on the Downloads page + header indicator; the
// cleanup confirmation and action feedback show as modals, not on the hero.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ScrapeJobStatus } from "@/lib/providers/scrapeJob";
import FirmwareModal from "./FirmwareModal";
import RomUploadModal from "./RomUploadModal";
import RibbonCollage, { HERO_LAYOUT } from "./RibbonCollage";
import { GpConfirm, GpModal, GpButton } from "@/components/bpm/primitives";
import ControllerLayout from "./ControllerLayout";
import {
  GCloud, GRevert, GBackfill, GHeroArt, GPencil, GIcon, GScrape, GList,
} from "./menuGlyphs";
import { playSound } from "@/lib/sounds";

const ROW =
  "block w-full cursor-pointer bg-[#23282e] px-6 py-3.5 text-left text-[15px] text-body hover:bg-[#2d333b] hover:text-bright focus:bg-[#2d333b] focus:text-bright focus:outline-none disabled:cursor-default disabled:opacity-40";
const SUB_ROW =
  "flex w-full cursor-pointer items-center gap-3 bg-[#23282e] px-5 py-2.5 text-left text-sm text-body hover:bg-[#2d333b] hover:text-bright focus:bg-[#2d333b] focus:text-bright focus:outline-none disabled:cursor-default disabled:opacity-40";
const SUB_HEADER =
  "bg-[#1c2127] px-5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-dim";
// Group headers inside the main menu (Games / System / Maintenance)
const SECTION =
  "bg-[#1c2127] px-6 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-dim";

type Candidate = { url: string; provider: string };
type ArtKind = "hero" | "logo" | "icon" | "ribbon";

export default function SystemTools({
  slug,
  shortName,
  covers = [],
  color,
  heroSource = "ribbon",
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: {
  slug: string;
  shortName: string;
  /** top-rated covers for the "Generated ribbon" hero preview */
  covers?: string[];
  color: string;
  /** which source currently backs the hero — for the "current" badge */
  heroSource?: "ribbon" | "image";
  /** Controlled open state (e.g. opened as a context menu from the browse
   *  grid). When provided, the component is controlled and reports changes via
   *  onOpenChange. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hide the built-in ⚙ button (when the menu is opened externally) */
  hideTrigger?: boolean;
}) {
  const t = useTranslations("systemTools");
  const ART_LABEL: Record<ArtKind, string> = {
    hero: t("artLabel.hero"),
    logo: t("artLabel.logo"),
    icon: t("artLabel.icon"),
    ribbon: t("artLabel.ribbon"),
  };
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
  const [view, setView] = useState<"menu" | ArtKind>("menu");
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const [expand, setExpand] = useState<"none" | "scrape" | "artwork" | "content" | "export">("none");
  // Reset to the root menu whenever it (re)opens — including controlled opens
  // from the browse grid, where there's no toggle() to do it.
  const prevOpen = useRef(open);
  useEffect(() => {
    if (open && !prevOpen.current) {
      setView("menu");
      setExpand("none");
    }
    prevOpen.current = open;
  }, [open]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [job, setJob] = useState<ScrapeJobStatus | null>(null);
  const [cleanupArmed, setCleanupArmed] = useState<number | null>(null);
  const [firmwareOpen, setFirmwareOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [ctrlLayoutOpen, setCtrlLayoutOpen] = useState(false);
  // Artwork picker (one kind visible at a time)
  const [artCands, setArtCands] = useState<Candidate[] | null>(null);
  const [artMsg, setArtMsg] = useState("");
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false); // synchronous guard against double-clicks
  // Hide candidates whose image 404s (e.g. libretro thumbnails that don't exist).
  const [brokenArt, setBrokenArt] = useState<Record<string, true>>({});
  const markBrokenArt = (url: string) => setBrokenArt((b) => (b[url] ? b : { ...b, [url]: true }));
  const router = useRouter();

  // A scrape covering THIS system drives the live grid refresh below (covers pop
  // in as each game is scraped). A 3DS-only scrape shouldn't refresh the PS3 page.
  const jobRunning = job?.running ?? false;
  const running = jobRunning && (job!.systems === null || job!.systems.includes(slug));

  // B / Escape steps back out of a picker view, then closes the menu
  useEffect(() => {
    const close = () => {
      playSound("menuClose");
      if (viewRef.current !== "menu") setView("menu");
      else setOpen(false);
    };
    const onB = (e: Event) => {
      if (openRef.current) {
        e.preventDefault();
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openRef.current) {
        e.stopImmediatePropagation();
        close();
      }
    };
    window.addEventListener("gh-b", onB);
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("gh-b", onB);
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, []);

  // Poll the background scrape job while it runs (and once on mount, so an
  // in-flight job started elsewhere shows up here too). While a job covering
  // THIS system progresses, refresh the page so covers pop in as each game
  // gets scraped.
  const lastDone = useRef(-1);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch("/api/scrape/job");
        const data: ScrapeJobStatus = await res.json();
        if (stopped) return;
        setJob(data);
        const coversThis = data.systems === null || data.systems.includes(slug);
        if (data.running) {
          if (coversThis && data.done !== lastDone.current) {
            lastDone.current = data.done;
            // Reload the loaded grid pages so freshly scraped covers pop in
            window.dispatchEvent(new Event("gh-library-refetch"));
            router.refresh();
          }
          timer = setTimeout(poll, 2000);
        } else {
          if (lastDone.current !== -1) {
            window.dispatchEvent(new Event("gh-library-refetch"));
          }
          lastDone.current = -1;
          router.refresh();
        }
      } catch {
        if (!stopped) timer = setTimeout(poll, 5000);
      }
    }
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function toggle() {
    const next = !open;
    playSound(next ? "menuOpen" : "menuClose");
    // Reset to the root menu each time it opens (mirrors the game options modal)
    if (next) {
      setView("menu");
      setExpand("none");
    }
    setOpen(next);
  }

  async function rescan() {
    setOpen(false);
    playSound("activate");
    setBusy("scan");
    setMsg(t("scanning", { name: shortName }));
    try {
      const res = await fetch("/api/scan/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systems: [slug] }),
      });
      const data = await res.json();
      setMsg(res.ok ? t("scanStarted") : (data.error ?? t("scanFailed")));
    } finally {
      setBusy("");
    }
  }

  async function scrape(onlyMissing: boolean, metadataOnly = false) {
    setOpen(false);
    playSound("activate");
    setMsg("");
    const res = await fetch("/api/scrape/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlyMissing, systems: [slug], metadataOnly }),
    });
    const data = await res.json();
    if (!res.ok) setMsg(data.error ?? t("scrapeStartFailed"));
    else if (data.queued)
      setMsg(t("scrapeQueued"));
    else setMsg(t("scrapeStarted", { name: shortName }));
    setJob(data);
  }

  async function checkCleanup() {
    setOpen(false);
    setBusy("cleanup");
    setMsg("");
    try {
      const res = await fetch(`/api/cleanup?systems=${slug}`);
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? t("cleanupCheckFailed"));
        return;
      }
      if (data.missing === 0) {
        setMsg(t("nothingToClean", { name: shortName }));
      } else {
        playSound("modalOpen");
        setCleanupArmed(data.missing);
      }
    } finally {
      setBusy("");
    }
  }

  async function runCleanup() {
    playSound("activate");
    setBusy("cleanup");
    try {
      const res = await fetch("/api/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systems: [slug] }),
      });
      const data = await res.json();
      setMsg(
        res.ok
          ? t("cleanupRemoved", { games: data.removedGames, folders: data.removedMediaFolders })
          : (data.error ?? t("cleanupFailed"))
      );
      setCleanupArmed(null);
      router.refresh();
    } finally {
      setBusy("");
    }
  }

  // ---- Artwork pickers ---------------------------------------------------
  async function openArtPicker(kind: ArtKind) {
    setView(kind);
    setExpand("none");
    setArtCands(null);
    setArtMsg(t("searchingProviders"));
    try {
      const res = await fetch(`/api/systems/${slug}/art/candidates?kind=${kind}`);
      const data = await res.json();
      setArtCands(data.candidates ?? []);
      setArtMsg(
        (data.candidates ?? []).length === 0
          ? data.errors?.length
            ? t("noArtFoundErrors", { kind: ART_LABEL[kind], errors: data.errors.join("; ") })
            : t("noArtFoundConfigure", { kind: ART_LABEL[kind] })
          : ""
      );
    } catch (e) {
      setArtMsg(`✗ ${e instanceof Error ? e.message : e}`);
    }
  }

  // url string → set; url null → clear; suppress → turn off ("no logo")
  async function pickArt(kind: ArtKind, url: string | null, suppress = false) {
    if (pickingRef.current) return;
    pickingRef.current = true;
    setPicking(true);
    setArtMsg(suppress ? t("turningOff") : url ? t("downloading") : t("clearing"));
    try {
      const res = await fetch(`/api/systems/${slug}/art`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, url, suppress }),
      });
      const data = await res.json();
      if (res.ok) {
        playSound("toast");
        setOpen(false);
        router.refresh();
      } else {
        setArtMsg(`✗ ${data.error ?? t("failed")}`);
      }
    } catch (e) {
      setArtMsg(`✗ ${e instanceof Error ? e.message : e}`);
    } finally {
      pickingRef.current = false;
      setPicking(false);
    }
  }

  // Use GameHub's generated cover collage as the hero (no download; sets the
  // system's hero source back to the ribbon).
  async function useRibbonHero() {
    if (pickingRef.current) return;
    pickingRef.current = true;
    setPicking(true);
    setArtMsg(t("applying"));
    try {
      const res = await fetch(`/api/systems/${slug}/art`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "hero", source: "ribbon" }),
      });
      const data = await res.json();
      if (res.ok) {
        playSound("toast");
        setOpen(false);
        router.refresh();
      } else {
        setArtMsg(`✗ ${data.error ?? t("failed")}`);
      }
    } catch (e) {
      setArtMsg(`✗ ${e instanceof Error ? e.message : e}`);
    } finally {
      pickingRef.current = false;
      setPicking(false);
    }
  }

  async function autofetchArt() {
    setOpen(false);
    playSound("activate");
    setBusy("art");
    setMsg(t("fetchingArtwork"));
    try {
      const res = await fetch(`/api/systems/${slug}/art?force=1`, { method: "POST" });
      const data = await res.json();
      setMsg(
        res.ok
          ? data.got?.length
            ? t("artUpdated", { items: data.got.join(" & ") })
            : t("noNewArt")
          : (data.error ?? t("artFetchFailed"))
      );
      if (res.ok && data.got?.length) router.refresh();
    } finally {
      setBusy("");
    }
  }

  async function scrapeMeta() {
    setOpen(false);
    playSound("activate");
    setBusy("meta");
    setMsg(t("fetchingInfo"));
    try {
      const res = await fetch(`/api/systems/${slug}/meta`, { method: "POST" });
      const data = await res.json();
      setMsg(
        res.ok
          ? data.stored
            ? t("infoUpdated")
            : t("noInfoFound")
          : (data.error ?? t("infoFetchFailed"))
      );
      if (res.ok && data.stored) router.refresh();
    } finally {
      setBusy("");
    }
  }

  // Export this system for another launcher. Fetched as a blob (not a bare
  // link) so a "no multi-disc games" 404 surfaces as a message instead of a
  // broken download.
  async function exportDownload(format: "gamelist" | "retroarch" | "m3u", fallbackName: string) {
    setOpen(false);
    playSound("activate");
    setBusy("export");
    setMsg("");
    try {
      const res = await fetch(`/api/export/${format}/${slug}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg(data.error ?? t("exportFailed"));
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const name = cd.match(/filename="?([^"]+)"?/)?.[1] ?? fallbackName;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMsg(`✗ ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      {!hideTrigger && (
        <button
          onClick={toggle}
          className="appdetailsplaysection_MenuButton_gh flex h-12 w-12 cursor-pointer items-center justify-center rounded-[2px] bg-[#acb2c9]/[0.14] text-body transition-colors hover:bg-[#acb2c9]/25 hover:text-bright"
          title={t("toolsTitle", { name: shortName })}
          aria-label={t("systemToolsLabel")}
          aria-expanded={open}
        >
          {/* Heroicons cog-6-tooth (solid) — matches the game options gear */}
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-[22px] w-[22px]">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"
            />
          </svg>
        </button>
      )}

      {firmwareOpen && (
        <FirmwareModal slug={slug} name={shortName} onClose={() => setFirmwareOpen(false)} />
      )}
      {uploadOpen && (
        <RomUploadModal slug={slug} name={shortName} onClose={() => setUploadOpen(false)} />
      )}
      {ctrlLayoutOpen && (
        <ControllerLayout
          scope={{ kind: "system", slug }}
          title={t("controllerLayoutTitle", { name: shortName })}
          onClose={() => setCtrlLayoutOpen(false)}
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
              view === "menu" ? "w-[420px]" : "w-[820px] max-w-[92vw]"
            }`}
          >
            <div className="mb-4 text-center text-xl font-semibold text-bright">
              {view === "menu" ? t("toolsTitle", { name: shortName }) : t("chooseArt", { kind: ART_LABEL[view], name: shortName })}
            </div>

            {view !== "menu" && (
              <div className="max-h-[70vh] overflow-y-auto rounded-[3px] bg-[#171d25] p-4 shadow-2xl">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setView("menu")}
                    className="btn-gray cursor-pointer px-3 py-1.5 text-xs"
                  >
                    {t("back")}
                  </button>
                  <div className="flex items-center gap-2">
                    {/* logo/icon can be turned OFF entirely (kept off through re-scrapes) */}
                    {view !== "hero" && (
                      <button
                        onClick={() => pickArt(view, null, true)}
                        className="btn-gray cursor-pointer px-3 py-1.5 text-xs"
                        title={t("neverShow", { kind: ART_LABEL[view] })}
                      >
                        🚫 {t("noArt", { kind: view })}
                      </button>
                    )}
                    <button
                      onClick={() => pickArt(view, null)}
                      className="btn-gray cursor-pointer px-3 py-1.5 text-xs"
                    >
                      ✕ {t("removeCurrent", { kind: view })}
                    </button>
                  </div>
                </div>
                {artMsg && <p className="mb-3 text-sm text-dim">{artMsg}</p>}
                {(view === "hero" && covers.length > 0) ||
                (artCands && artCands.length > 0) ? (
                  <div className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${picking ? "pointer-events-none opacity-60" : ""}`}>
                    {/* GameHub's own generated cover collage — the first hero option */}
                    {view === "hero" && covers.length > 0 && (
                      <button
                        onClick={useRibbonHero}
                        className="deck-card overflow-hidden rounded-[3px] bg-black text-left ring-1 ring-accent/60"
                        title={t("useRibbonTitle")}
                      >
                        <div
                          className="relative aspect-video w-full overflow-hidden [perspective:800px]"
                          style={{
                            background: `linear-gradient(120deg, #0b0f14 25%, #16202d 60%, ${color}44 100%)`,
                          }}
                        >
                          <RibbonCollage covers={covers} color={color} layout={HERO_LAYOUT} zoom={185} />
                        </div>
                        <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] font-semibold text-dim">
                          <span>GameHub · {t("generatedRibbon")}</span>
                          {heroSource === "ribbon" && <span className="text-accent">✓ {t("current")}</span>}
                        </div>
                      </button>
                    )}
                    {(artCands ?? []).filter((c) => !brokenArt[c.url]).map((c, i) => (
                      <button
                        key={`${c.url}-${i}`}
                        onClick={() => pickArt(view, c.url)}
                        className={
                          view === "hero"
                            ? "deck-card overflow-hidden rounded-[3px] bg-black text-left"
                            : "deck-card flex h-28 items-center justify-center overflow-hidden rounded-[3px] bg-black/40 p-4"
                        }
                        title={c.provider}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={c.url}
                          alt={c.provider}
                          loading="lazy"
                          onError={() => markBrokenArt(c.url)}
                          className={
                            view === "hero"
                              ? "aspect-video w-full object-cover"
                              : "max-h-full max-w-full object-contain"
                          }
                        />
                        {view === "hero" && (
                          <div className="px-2 py-1.5 text-[11px] font-semibold text-dim">
                            {c.provider}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {view === "menu" && (
              <>
                {/* NOTE: no overflow-hidden here — the ›flyout submenus are
                    absolutely positioned to the right (left-full) and would be
                    clipped by it. Corners are rounded on the first/last rows. */}
                <div className="flex flex-col rounded-[3px] bg-[#23282e] shadow-2xl [&>*:first-child]:rounded-t-[3px] [&>*:last-child]:rounded-b-[3px]">
                  {/* ---- Games in this system ---- */}
                  <div className={SECTION}>{t("games")}</div>
                  <button autoFocus onClick={rescan} disabled={busy !== ""} className={ROW}>
                    {t("rescanFiles")}
                  </button>

                  {/* Scrape metadata › (game data & art for this system's games) */}
                  <div className="relative">
                    <button
                      onClick={() => setExpand(expand === "scrape" ? "none" : "scrape")}
                      className={`${ROW} flex items-center justify-between`}
                    >
                      {t("scrapeMetadata")} <span className="text-dim">›</span>
                    </button>
                    {expand === "scrape" && (
                      <div className="absolute left-full top-0 ml-1.5 flex w-[290px] flex-col overflow-hidden rounded-[3px] shadow-2xl ring-1 ring-black/40">
                        <div className={SUB_HEADER}>{t("scrapeGameMetadata")}</div>
                        <button onClick={() => scrape(true)} className={SUB_ROW}>
                          <GCloud className="opacity-70" />
                          {t("scrapeMissing")}
                        </button>
                        <button onClick={() => scrape(false)} className={SUB_ROW}>
                          <GRevert className="opacity-70" />
                          {t("scrapeEverything")}
                        </button>
                        <button
                          onClick={() => scrape(false, true)}
                          className={SUB_ROW}
                          title={t("backfillTitle")}
                        >
                          <GBackfill className="opacity-70" />
                          {t("backfillMetadata")}
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setOpen(false);
                      playSound("modalOpen");
                      setUploadOpen(true);
                    }}
                    className={ROW}
                  >
                    {t("uploadRoms")}
                  </button>

                  {/* ---- This console ---- */}
                  <div className={SECTION}>{t("system")}</div>

                  {/* Images › (this console's hero / logo / icon) */}
                  <div className="relative">
                    <button
                      onClick={() => setExpand(expand === "artwork" ? "none" : "artwork")}
                      className={`${ROW} flex items-center justify-between`}
                    >
                      {t("images")} <span className="text-dim">›</span>
                    </button>
                    {expand === "artwork" && (
                      <div className="absolute left-full top-0 ml-1.5 flex w-[290px] flex-col overflow-hidden rounded-[3px] shadow-2xl ring-1 ring-black/40">
                        <div className={SUB_HEADER}>{t("systemImages")}</div>
                        <button onClick={() => openArtPicker("hero")} className={SUB_ROW}>
                          <GHeroArt className="opacity-70" />
                          {t("hero")}
                        </button>
                        <button onClick={() => openArtPicker("logo")} className={SUB_ROW}>
                          <GPencil className="opacity-70" />
                          {t("logo")}
                        </button>
                        <button onClick={() => openArtPicker("icon")} className={SUB_ROW}>
                          <GIcon className="opacity-70" />
                          {t("icon")}
                        </button>
                        <button onClick={autofetchArt} disabled={busy !== ""} className={SUB_ROW}>
                          <GScrape className="opacity-70" />
                          {t("autofetchAll")}
                        </button>
                      </div>
                    )}
                  </div>

                  <button onClick={scrapeMeta} disabled={busy !== ""} className={ROW}>
                    {t("updateSystemInfo")}
                  </button>
                  <button
                    onClick={() => {
                      setOpen(false);
                      playSound("modalOpen");
                      setCtrlLayoutOpen(true);
                    }}
                    className={ROW}
                    title={t("controllerLayoutTitleAttr", { name: shortName })}
                  >
                    {t("controllerLayout")}
                  </button>

                  {/* Export to another frontend › (gamelist / RetroArch / m3u) */}
                  <div className="relative">
                    <button
                      onClick={() => setExpand(expand === "export" ? "none" : "export")}
                      className={`${ROW} flex items-center justify-between`}
                    >
                      {t("exportToFrontend")} <span className="text-dim">›</span>
                    </button>
                    {expand === "export" && (
                      <div className="absolute left-full top-0 ml-1.5 flex w-[300px] flex-col overflow-hidden rounded-[3px] shadow-2xl ring-1 ring-black/40">
                        <div className={SUB_HEADER}>{t("exportLibrary", { name: shortName })}</div>
                        <button
                          onClick={() => exportDownload("gamelist", "gamelist.xml")}
                          disabled={busy !== ""}
                          className={SUB_ROW}
                          title={t("gamelistTitle")}
                        >
                          <GList className="opacity-70" />
                          {t("gamelistLabel")}
                        </button>
                        <button
                          onClick={() => exportDownload("retroarch", `${shortName}.lpl`)}
                          disabled={busy !== ""}
                          className={SUB_ROW}
                          title={t("retroarchTitle")}
                        >
                          <GList className="opacity-70" />
                          {t("retroarchLabel")}
                        </button>
                        <button
                          onClick={() => exportDownload("m3u", `${shortName} playlists.zip`)}
                          disabled={busy !== ""}
                          className={SUB_ROW}
                          title={t("m3uTitle")}
                        >
                          <GList className="opacity-70" />
                          {t("m3uLabel")}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ---- Maintenance ---- */}
                  <div className={SECTION}>{t("maintenance")}</div>
                  <button
                    onClick={() => {
                      setOpen(false);
                      playSound("modalOpen");
                      setFirmwareOpen(true);
                    }}
                    className={ROW}
                  >
                    {t("manageFirmware")}
                  </button>
                  <button onClick={checkCleanup} disabled={busy !== ""} className={ROW}>
                    {t("cleanUpMissing")}
                  </button>
                </div>

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

      {/* Cleanup confirmation — a modal, not a header banner. Scan/scrape/rescan
          progress isn't shown on this page at all; it lives on the Downloads
          page and the header job indicator. */}
      {cleanupArmed !== null && (
        <GpConfirm
          title={t("removeMissingTitle")}
          confirmLabel={t("remove")}
          danger
          onConfirm={runCleanup}
          onClose={() => setCleanupArmed(null)}
        >
          {t.rich("cleanupConfirm", {
            count: cleanupArmed,
            name: shortName,
            b: (chunks) => <span className="font-bold text-bright">{chunks}</span>,
          })}
        </GpConfirm>
      )}

      {/* Transient action feedback (scan started, errors, cleanup results). */}
      {msg && (
        <GpModal
          title={t("systemToolsLabel")}
          width={480}
          onClose={() => setMsg("")}
          footer={<GpButton primary onClick={() => setMsg("")}>{t("ok")}</GpButton>}
        >
          <div className="text-[15px] leading-relaxed text-body">{msg}</div>
        </GpModal>
      )}
    </>
  );
}
