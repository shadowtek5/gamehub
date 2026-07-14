"use client";

// Mobile game options — a bottom sheet (not the desktop fly-out modal). Covers
// the common actions directly and pushes into sub-sheets for collections and
// admin "Manage" tools. Hits the same APIs as the desktop GameOptionsModal.

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import MobileArtPicker, {
  ArtHeaderButton,
  type ArtCandidate,
  type ArtAspect,
} from "./MobileArtPicker";
import { MobileSheet, SheetRow, SheetSection, SheetCloseButton, SheetBack } from "./primitives";
import RomPatcherModal from "@/components/RomPatcherModal";

interface CollectionOpt {
  id: number;
  name: string;
  hasRom: boolean;
}

type ArtKind = "boxart" | "hero" | "logo";
const ART_META: Record<ArtKind, { labelKey: string; aspect: ArtAspect; clearKey: string }> = {
  boxart: { labelKey: "artLabelBoxart", aspect: "portrait", clearKey: "clearUseGeneratedCover" },
  hero: { labelKey: "artLabelHero", aspect: "video", clearKey: "clearRemoveCurrent" },
  logo: { labelKey: "artLabelLogo", aspect: "logo", clearKey: "clearRemoveCurrent" },
};

export default function MobileGameOptions({
  romId,
  title,
  favorite: initialFav,
  hidden: initialHidden = false,
  isAdmin,
  collections: initialCollections,
  hasManual = false,
  filename,
}: {
  romId: number;
  title: string;
  favorite: boolean;
  hidden?: boolean;
  isAdmin: boolean;
  collections: CollectionOpt[];
  hasManual?: boolean;
  filename: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "collections" | "art" | "match">("menu");
  const [matchQuery, setMatchQuery] = useState("");
  const [matchResults, setMatchResults] = useState<
    { provider: string; id: number; title: string; system?: string; year?: string }[] | null
  >(null);
  const [matchMsg, setMatchMsg] = useState("");
  const [matchBusy, setMatchBusy] = useState(false);
  const [favorite, setFavorite] = useState(initialFav);
  const [hidden, setHidden] = useState(initialHidden);
  const [collections, setCollections] = useState(initialCollections);
  const [msg, setMsg] = useState("");
  const [mediaMsg, setMediaMsg] = useState("");
  const [patcherOpen, setPatcherOpen] = useState(false);
  const [artKind, setArtKind] = useState<ArtKind>("boxart");
  const [artCands, setArtCands] = useState<ArtCandidate[] | null>(null);
  const [artMsg, setArtMsg] = useState("");
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false); // synchronous guard against double-taps
  const router = useRouter();
  const t = useTranslations("mobileGameOptions");
  const tg = useTranslations("gameOptions"); // reuse the desktop action labels

  const show = () => {
    playSound("modalOpen");
    setView("menu");
    setMsg("");
    setOpen(true);
  };
  const close = () => setOpen(false);

  async function openArtPicker(kind: ArtKind) {
    setArtKind(kind);
    setView("art");
    setArtCands(null);
    setArtMsg(t("searchingProviders"));
    try {
      const res = await fetch(`/api/roms/${romId}/${kind}-candidates`);
      const data = await res.json();
      const cands: ArtCandidate[] = data.candidates ?? [];
      setArtCands(cands);
      setArtMsg(
        cands.length === 0
          ? `${t("noArtFound", { label: t(ART_META[kind].labelKey) })}${data.errors?.length ? ` — ${data.errors.join("; ")}` : ""}`
          : ""
      );
    } catch (e) {
      setArtCands([]);
      setArtMsg(`✗ ${e instanceof Error ? e.message : e}`);
    }
  }

  async function pickArt(url: string | null) {
    if (pickingRef.current) return; // ignore double-taps while a pick is applying
    pickingRef.current = true;
    setPicking(true);
    setArtMsg(url ? t("downloading") : t("clearing"));
    try {
      const res = await fetch(`/api/roms/${romId}/${artKind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok) {
        playSound("toast");
        close();
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
    await fetch(`/api/roms/${romId}/personal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: next }),
    });
    router.refresh();
  }
  async function toggleCollection(c: CollectionOpt) {
    setCollections((cur) => cur.map((x) => (x.id === c.id ? { ...x, hasRom: !x.hasRom } : x)));
    await fetch(`/api/collections/${c.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ romId, action: c.hasRom ? "remove" : "add" }),
    });
    router.refresh();
  }
  async function scrape(metadataOnly = false) {
    setMsg(t("scraping"));
    const res = await fetch(`/api/roms/${romId}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadataOnly ? { mode: "metadata" } : {}),
    });
    const o = await res.json();
    setMsg(
      o.ok
        ? `✓ ${t("gotMetadata", { items: o.got?.join(", ") || t("metadataFallback") })}`
        : `✗ ${o.error ?? t("nothingFound")}`
    );
    if (o.ok) router.refresh();
  }

  // Fix metadata match: search providers and re-scrape as the chosen game.
  async function searchMatches(q: string) {
    setMatchBusy(true);
    setMatchMsg(tg("searchingScreenscraper"));
    setMatchResults(null);
    try {
      const res = await fetch(`/api/roms/${romId}/match-candidates?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const cands = data.candidates ?? [];
      setMatchResults(cands);
      setMatchMsg(cands.length === 0 ? tg("nothingForMatch") : "");
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
    setMatchMsg(tg("scrapingAs", { name }));
    try {
      const res = await fetch(`/api/roms/${romId}/rematch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, gameId }),
      });
      const outcome = await res.json();
      if (outcome.ok) {
        playSound("toast");
        close();
        router.refresh();
      } else {
        setMatchMsg(`✗ ${outcome.error ?? tg("nothingForMatch")}`);
      }
    } catch (e) {
      setMatchMsg(`✗ ${e instanceof Error ? e.message : e}`);
    } finally {
      setMatchBusy(false);
    }
  }

  // On-demand FTP fetch of a video snap / manual (same endpoint as desktop).
  async function fetchMedia(kind: "video" | "manual") {
    setMediaMsg(`${tg(`fetchLabels.${kind}.title`)}…`);
    try {
      const res = await fetch(`/api/roms/${romId}/fetch-${kind}`, { method: "POST" });
      const o = await res.json();
      setMediaMsg(o.ok ? `✓ ${tg(`fetchLabels.${kind}.added`)}` : `✗ ${o.error ?? tg(`fetchLabels.${kind}.notFound`)}`);
      if (o.ok) router.refresh();
    } catch (e) {
      setMediaMsg(`✗ ${e instanceof Error ? e.message : ""}`);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={t("gameOptions")}
        className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-[#1a1f27] text-body ring-1 ring-white/10 active:bg-[#232a34]"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-[22px] w-[22px]">
          <path fillRule="evenodd" clipRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.5 7.5 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.6 7.6 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.6 7.6 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.5 7.5 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" />
        </svg>
      </button>

      {open && (
        <MobileSheet onClose={close} zIndex={80}>
          <div className="truncate px-5 pb-2 text-[13px] font-semibold text-dim">
            {view === "art"
              ? t("chooseArtTitle", { label: t(ART_META[artKind].labelKey), title })
              : title}
          </div>

          {view === "menu" ? (
            <div className="flex flex-col">
              <SheetRow onClick={toggleFavorite}>
                <span className={favorite ? "text-accent" : "text-dim"}>★</span>
                {favorite ? t("removeFromFavorites") : t("addToFavorites")}
              </SheetRow>
              <SheetRow onClick={() => setView("collections")}>
                <span className="text-dim">▤</span> {t("addToCollection")}
                <span className="ml-auto text-dim">›</span>
              </SheetRow>
              <SheetRow onClick={toggleHidden}>
                <span className="text-dim">{hidden ? "◎" : "⦸"}</span>
                {hidden ? t("unhideFromLibrary") : t("hideFromLibrary")}
              </SheetRow>
              {hasManual && (
                <SheetRow
                  onClick={() => {
                    close();
                    window.dispatchEvent(new Event("gh-open-manual"));
                  }}
                >
                  <span className="text-dim">📖</span> {t("readManual")}
                </SheetRow>
              )}
              <SheetRow href={`/api/roms/${romId}/file?download=1`}>
                <span className="text-dim">⇩</span> {t("downloadRom")}
              </SheetRow>
              {isAdmin && (
                <>
                  <SheetSection divider>{t("admin")}</SheetSection>
                  <SheetRow onClick={() => scrape()}>
                    <span className="text-dim">⤵</span> {t("scrapeMetadata")}
                    {msg && ` — ${msg}`}
                  </SheetRow>
                  <SheetRow onClick={() => scrape(true)}>
                    <span className="text-dim">⤓</span> {t("backfillMetadata")}
                  </SheetRow>
                  <SheetRow onClick={openMatchView}>
                    <span className="text-dim">⌖</span> {tg("fixMatch")}
                  </SheetRow>
                  <SheetRow onClick={() => openArtPicker("boxart")}>
                    <span className="text-dim">▦</span> {t("chooseBoxArt")}
                  </SheetRow>
                  <SheetRow onClick={() => openArtPicker("hero")}>
                    <span className="text-dim">▭</span> {t("chooseHeroArtwork")}
                  </SheetRow>
                  <SheetRow onClick={() => openArtPicker("logo")}>
                    <span className="text-dim">✎</span> {t("chooseLogo")}
                  </SheetRow>
                  <SheetRow onClick={() => fetchMedia("video")}>
                    <span className="text-dim">🎬</span> {tg("fetchVideoSnap")}
                  </SheetRow>
                  <SheetRow onClick={() => fetchMedia("manual")}>
                    <span className="text-dim">📖</span> {tg("fetchManual")}
                  </SheetRow>
                  {mediaMsg && <div className="px-5 py-1 text-[12px] text-dim">{mediaMsg}</div>}
                  <SheetRow
                    onClick={() => {
                      close();
                      playSound("modalOpen");
                      setPatcherOpen(true);
                    }}
                  >
                    <span className="text-dim">🩹</span> {tg("patchRom")}
                  </SheetRow>
                  <SheetRow href={`/mobile/game/${romId}/properties`}>
                    <span className="text-dim">⚙</span> {t("properties")}
                  </SheetRow>
                </>
              )}
              <SheetCloseButton onClick={close} />
            </div>
          ) : view === "collections" ? (
            <div className="flex flex-col">
              <SheetBack onClick={() => setView("menu")} />
              {collections.length === 0 ? (
                <div className="px-5 py-4 text-sm text-dim">{t("noCollectionsYet")}</div>
              ) : (
                collections.map((c) => (
                  <SheetRow key={c.id} onClick={() => toggleCollection(c)}>
                    <span className={c.hasRom ? "text-accent" : "text-transparent"}>✓</span>
                    {c.name}
                  </SheetRow>
                ))
              )}
              <div className="mt-1 border-t border-white/5 px-4 pt-3">
                <Link
                  href="/mobile/collections"
                  className="block w-full rounded-[8px] bg-[#232a34] py-3 text-center text-[14px] font-semibold text-body"
                >
                  {t("manageCollections")}
                </Link>
              </div>
            </div>
          ) : view === "match" ? (
            <div className="flex flex-col">
              <SheetBack onClick={() => setView("menu")} />
              <div className="flex items-center gap-2 px-4 pb-2">
                <input
                  value={matchQuery}
                  onChange={(e) => setMatchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && matchQuery.trim()) searchMatches(matchQuery.trim());
                  }}
                  placeholder={tg("gameNamePlaceholder")}
                  className="min-w-0 flex-1 rounded-[8px] bg-[#12161c] px-3 py-2 text-sm text-body ring-1 ring-white/10 focus:outline-none focus:ring-accent/50"
                />
                <button
                  onClick={() => matchQuery.trim() && searchMatches(matchQuery.trim())}
                  disabled={matchBusy}
                  className="shrink-0 rounded-[8px] bg-accent px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
                >
                  {tg("search")}
                </button>
              </div>
              <p className="px-4 pb-2 text-[12px] text-dim">{tg("matchHelp")}</p>
              {matchMsg && <p className="px-4 pb-2 text-[13px] text-dim">{matchMsg}</p>}
              {matchResults?.map((m) => (
                <SheetRow key={`${m.provider}-${m.id}`} onClick={() => applyMatch(m.provider, m.id, m.title)} disabled={matchBusy}>
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  {m.system && <span className="shrink-0 text-[12px] text-dim">{m.system}</span>}
                  {m.year && <span className="shrink-0 text-[12px] text-dim">{m.year}</span>}
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dim">
                    {m.provider === "screenscraper" ? "SS" : m.provider === "launchbox" ? "LB" : "IGDB"}
                  </span>
                </SheetRow>
              ))}
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
                <ArtHeaderButton onClick={() => pickArt(null)}>
                  {t(ART_META[artKind].clearKey)}
                </ArtHeaderButton>
              }
            />
          )}
        </MobileSheet>
      )}

      {patcherOpen && (
        <RomPatcherModal romId={romId} title={title} filename={filename} onClose={() => setPatcherOpen(false)} />
      )}
    </>
  );
}
