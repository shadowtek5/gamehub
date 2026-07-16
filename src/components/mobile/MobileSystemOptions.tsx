"use client";

// Mobile system tools — the ⚙ for a system page, as a bottom sheet. Admin
// actions that mirror the desktop SystemTools: rescan, scrape, card shape,
// update info, cleanup. Full artwork/firmware/upload management stays on the
// desktop tools for now.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { playSound } from "@/lib/sounds";
import MobileArtPicker, {
  ArtHeaderButton,
  type ArtCandidate,
  type ArtAspect,
} from "./MobileArtPicker";
import { MobileSheet, SheetRow, SheetSection, SheetCloseButton } from "./primitives";
import { useTranslations } from "next-intl";
import RomUploadModal from "@/components/RomUploadModal";
import FirmwareModal from "@/components/FirmwareModal";
import ControllerLayout from "@/components/ControllerLayout";
import CustomCollageManager from "@/components/CustomCollageManager";
import {
  GRefresh, GCloud, GRevert, GBackfill, GHeroArt, GPencil, GIcon, GScrape,
  GInfo, GBroom, GUpload, GFirmware, GGamepad, GList,
} from "@/components/menuGlyphs";

type ArtKind = "hero" | "logo" | "icon";
const ART_META: Record<ArtKind, { label: string; aspect: ArtAspect; canSuppress: boolean }> = {
  hero: { label: "hero image", aspect: "video", canSuppress: false },
  logo: { label: "logo", aspect: "logo", canSuppress: true },
  icon: { label: "icon", aspect: "logo", canSuppress: true },
};

export default function MobileSystemOptions({
  slug,
  shortName,
}: {
  slug: string;
  shortName: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "art">("menu");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [cleanupCount, setCleanupCount] = useState<number | null>(null);
  const [artKind, setArtKind] = useState<ArtKind>("hero");
  const [artCands, setArtCands] = useState<ArtCandidate[] | null>(null);
  const [artMsg, setArtMsg] = useState("");
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false); // synchronous guard against double-taps
  const [uploadOpen, setUploadOpen] = useState(false);
  const [firmwareOpen, setFirmwareOpen] = useState(false);
  const [ctrlLayoutOpen, setCtrlLayoutOpen] = useState(false);
  const [collageOpen, setCollageOpen] = useState(false);
  const router = useRouter();
  const tc = useTranslations("customCollage");
  const t = useTranslations("mobileSystemOptions");
  const ts = useTranslations("systemTools"); // reuse the desktop system-tools labels
  const artLabel = (kind: ArtKind) => t(`artLabel.${kind}`);

  const show = () => {
    playSound("modalOpen");
    setView("menu");
    setMsg("");
    setCleanupCount(null);
    setOpen(true);
  };

  async function openArtPicker(kind: ArtKind) {
    setArtKind(kind);
    setView("art");
    setArtCands(null);
    setArtMsg(t("searchingProviders"));
    try {
      const res = await fetch(`/api/systems/${slug}/art/candidates?kind=${kind}`);
      const data = await res.json();
      const cands: ArtCandidate[] = data.candidates ?? [];
      setArtCands(cands);
      setArtMsg(
        cands.length === 0
          ? `${t("noArtFound", { label: artLabel(kind) })}${data.errors?.length ? ` — ${data.errors.join("; ")}` : ""}`
          : ""
      );
    } catch (e) {
      setArtCands([]);
      setArtMsg(`✗ ${e instanceof Error ? e.message : e}`);
    }
  }

  // url string → set; url null → clear; suppress → turn off ("no logo/icon")
  async function pickArt(url: string | null, suppress = false) {
    if (pickingRef.current) return;
    pickingRef.current = true;
    setPicking(true);
    setArtMsg(suppress ? t("turningOff") : url ? t("downloading") : t("clearing"));
    try {
      const res = await fetch(`/api/systems/${slug}/art`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: artKind, url, suppress }),
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

  // Use GameHub's generated cover collage as the hero (no download).
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
    setBusy(true);
    setMsg(t("fetchingSystemArtwork"));
    try {
      const res = await fetch(`/api/systems/${slug}/art?force=1`, { method: "POST" });
      const data = await res.json();
      setMsg(
        res.ok
          ? data.got?.length
            ? t("updatedSystem", { items: data.got.join(" & ") })
            : t("noNewSystemArtwork")
          : `✗ ${data.error ?? t("couldntFetchSystemArtwork")}`
      );
      if (res.ok && data.got?.length) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function rescan() {
    setBusy(true);
    setMsg(t("startingScan"));
    try {
      const res = await fetch("/api/scan/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systems: [slug] }),
      });
      if (res.ok) {
        setOpen(false);
        router.push("/mobile/downloads");
      } else {
        setMsg(t("couldntStartScan"));
      }
    } finally {
      setBusy(false);
    }
  }
  async function scrape(onlyMissing: boolean, metadataOnly = false) {
    setBusy(true);
    setMsg(t("startingScrape"));
    try {
      const res = await fetch("/api/scrape/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlyMissing, systems: [slug], metadataOnly }),
      });
      if (res.ok) {
        setOpen(false);
        router.push("/mobile/downloads");
      } else {
        setMsg(t("couldntStartScrape"));
      }
    } finally {
      setBusy(false);
    }
  }
  async function updateInfo() {
    setBusy(true);
    setMsg(t("fetchingSystemInfo"));
    try {
      const res = await fetch(`/api/systems/${slug}/meta`, { method: "POST" });
      const d = await res.json();
      setMsg(res.ok ? (d.stored ? t("systemInfoUpdated") : t("noInfoFound")) : `✗ ${t("failed")}`);
      if (res.ok && d.stored) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  async function checkCleanup() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/cleanup?systems=${slug}`);
      const d = await res.json();
      if (!res.ok) setMsg(d.error ?? t("cleanupCheckFailed"));
      else if (d.missing === 0) setMsg(t("nothingToClean", { name: shortName }));
      else setCleanupCount(d.missing);
    } finally {
      setBusy(false);
    }
  }
  async function runCleanup() {
    setBusy(true);
    try {
      const res = await fetch("/api/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systems: [slug] }),
      });
      const d = await res.json();
      setMsg(res.ok ? t("removedGames", { count: d.removedGames }) : (d.error ?? t("cleanupFailed")));
      setCleanupCount(null);
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Export this system for another launcher (blob download, same endpoint as desktop).
  async function exportDownload(format: "gamelist" | "retroarch" | "m3u", fallbackName: string) {
    setOpen(false);
    playSound("activate");
    try {
      const res = await fetch(`/api/export/${format}/${slug}`);
      if (!res.ok) return;
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
    } catch {
      /* ignore — a failed export just doesn't download */
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={t("systemOptions")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#1a1f27] text-body ring-1 ring-white/10 active:bg-[#232a34]"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path fillRule="evenodd" clipRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.5 7.5 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.6 7.6 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.6 7.6 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.5 7.5 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" />
        </svg>
      </button>

      {open && (
        <MobileSheet onClose={() => setOpen(false)} zIndex={80}>
          <div className="px-5 pb-2 text-[13px] font-semibold text-dim">
            {view === "art" ? t("chooseArt", { label: artLabel(artKind), name: shortName }) : t("systemTools", { name: shortName })}
          </div>

          {view === "menu" ? (
            <div className="flex flex-col">
              {/* Grouping mirrors the desktop system cog: Games (incl. Upload) →
                  Artwork → System → Export → Maintenance (with cleanup isolated
                  last as the only destructive action). */}
              <SheetRow onClick={rescan} disabled={busy}><GRefresh className="text-dim" /> {t("rescanFiles")}</SheetRow>
              <SheetRow onClick={() => scrape(true)} disabled={busy}><GCloud className="text-dim" /> {t("scrapeMissing")}</SheetRow>
              <SheetRow onClick={() => scrape(false)} disabled={busy}><GRevert className="text-dim" /> {t("scrapeEverything")}</SheetRow>
              <SheetRow onClick={() => scrape(false, true)} disabled={busy}><GBackfill className="text-dim" /> {t("backfillMetadata")}</SheetRow>
              <SheetRow onClick={() => { setOpen(false); setUploadOpen(true); }}>
                <GUpload className="text-dim" /> {ts("uploadRoms")}
              </SheetRow>
              <SheetSection>{t("sectionArtwork")}</SheetSection>
              <SheetRow onClick={() => openArtPicker("hero")}><GHeroArt className="text-dim" /> {t("heroImageMenu")}</SheetRow>
              <SheetRow onClick={() => openArtPicker("logo")}><GPencil className="text-dim" /> {t("logoMenu")}</SheetRow>
              <SheetRow onClick={() => openArtPicker("icon")}><GIcon className="text-dim" /> {t("iconMenu")}</SheetRow>
              <SheetRow onClick={autofetchArt} disabled={busy}><GScrape className="text-dim" /> {t("autoFetchAll")}</SheetRow>
              <SheetRow onClick={() => { setOpen(false); setCollageOpen(true); }}><GHeroArt className="text-dim" /> {tc("openLabel")}</SheetRow>
              <SheetSection>{t("sectionSystem")}</SheetSection>
              <SheetRow onClick={updateInfo} disabled={busy}><GInfo className="text-dim" /> {t("updateSystemInfo")}</SheetRow>
              <SheetRow onClick={() => { setOpen(false); setCtrlLayoutOpen(true); }}>
                <GGamepad className="text-dim" /> {ts("controllerLayout")}
              </SheetRow>
              <SheetSection>{ts("exportToFrontend")}</SheetSection>
              <SheetRow onClick={() => exportDownload("gamelist", "gamelist.xml")}>
                <GList className="text-dim" /> {ts("gamelistLabel")}
              </SheetRow>
              <SheetRow onClick={() => exportDownload("retroarch", `${shortName}.lpl`)}>
                <GList className="text-dim" /> {ts("retroarchLabel")}
              </SheetRow>
              <SheetRow onClick={() => exportDownload("m3u", `${shortName}.zip`)}>
                <GList className="text-dim" /> {ts("m3uLabel")}
              </SheetRow>
              <SheetSection>{t("sectionMaintenance")}</SheetSection>
              <SheetRow onClick={() => { setOpen(false); setFirmwareOpen(true); }}>
                <GFirmware className="text-dim" /> {ts("manageFirmware")}
              </SheetRow>
              {cleanupCount === null ? (
                <SheetRow onClick={checkCleanup} disabled={busy}><GBroom className="text-dim" /> {t("cleanUpMissing")}</SheetRow>
              ) : (
                <div className="flex items-center gap-3 px-5 py-3">
                  <span className="flex-1 text-[14px] text-body">{t("removeMissingGames", { count: cleanupCount })}</span>
                  <button onClick={runCleanup} disabled={busy} className="rounded-[6px] bg-[#a33a3a] px-3 py-1.5 text-[13px] font-semibold text-white">{t("remove")}</button>
                </div>
              )}
              {msg && <div className="px-5 py-2 text-[13px] text-dim">{msg}</div>}
              <SheetCloseButton onClick={() => setOpen(false)} />
            </div>
          ) : (
            <MobileArtPicker
              candidates={artCands}
              msg={artMsg}
              aspect={ART_META[artKind].aspect}
              busy={picking}
              onBack={() => setView("menu")}
              onPick={(url) => pickArt(url)}
              headerActions={
                <>
                  {artKind === "hero" && (
                    <ArtHeaderButton onClick={useRibbonHero}>{t("useRibbon")}</ArtHeaderButton>
                  )}
                  {ART_META[artKind].canSuppress && (
                    <ArtHeaderButton onClick={() => pickArt(null, true)}>{t("noArt", { kind: artKind })}</ArtHeaderButton>
                  )}
                  <ArtHeaderButton onClick={() => pickArt(null)}>{t("remove")}</ArtHeaderButton>
                </>
              }
            />
          )}
        </MobileSheet>
      )}

      {uploadOpen && <RomUploadModal slug={slug} name={shortName} onClose={() => setUploadOpen(false)} />}
      {firmwareOpen && <FirmwareModal slug={slug} name={shortName} onClose={() => setFirmwareOpen(false)} />}
      {ctrlLayoutOpen && (
        <ControllerLayout
          scope={{ kind: "system", slug }}
          title={ts("controllerLayoutTitle", { name: shortName })}
          onClose={() => setCtrlLayoutOpen(false)}
        />
      )}
      <CustomCollageManager slug={slug} open={collageOpen} onClose={() => setCollageOpen(false)} />
    </>
  );
}
