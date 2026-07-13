"use client";

// SteamOS media section (game details → Your Stuff → Media), rebuilt 1:1 from
// the live Deck: a 2-column grid of sharp-cornered thumbnails on a near-black
// backing, that open the fullscreen screenshot viewer on click/Enter. Carries
// Steam's appdetailsscreenshotssection_* + screenshots_* module classes so
// deckthemes CSS applies as if Steam rendered it.
//
// Deck reference:
//   Section (413150, YourStuff → Media):
//     appdetailssection_Body            flex column, padding 10px
//       appdetailsscreenshotssection_Screenshots   grid, 2 cols, gap 12px, mb 5px
//         appdetailsscreenshotssection_Thumbnail / screenshots_ClickableScreenshot
//                                         bg rgba(1,1,1,0.6), radius 0
//   Viewer (media/item/screenshot/…):
//     backgroundglass  bg rgba(0,0,0,0.7)
//     frame  fills top→footer, bg rgba(0,0,0,0.6), inset vignette
//            box-shadow: inset 0 0 80px rgba(0,0,0,0.733); media fills the area
//     (Y) Show reveals a full-width details bar (with Delete) across the bottom
//     footer_BasicFooter  42px, bg rgba(0,0,0,0.5); legend = Show / Select / Back

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

export interface MediaItem {
  kind: "video" | "image" | "youtube";
  url: string;
  poster?: string | null;
}

/** Pull an 11-char YouTube id out of a watch/embed/short-link URL (or bare id). */
function youTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?[^#]*\bv=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(url) ? url : null;
}

const PlayGlyph = ({ className }: { className: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M6 4l14 8-14 8z" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m1 0v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7" />
  </svg>
);

// Footer legend glyph + chip, matching the app's LegendFooter.
const Glyph = ({ letter }: { letter: string }) => (
  <span className="flex h-[25px] w-[25px] items-center justify-center rounded-full bg-white text-[13px] font-black text-[#0e141b]">
    {letter}
  </span>
);

const LegendChip = ({
  letter,
  label,
  onClick,
  chipRef,
}: {
  letter: string;
  label: string;
  onClick: () => void;
  chipRef?: React.Ref<HTMLButtonElement>;
}) => (
  <button
    ref={chipRef}
    onClick={onClick}
    data-nav-skip
    className="actionbuttonlegenditem_ActionButtonLegend_gh Focusable flex cursor-pointer items-center rounded-[6px] px-2 py-[5px] outline-none transition-colors hover:bg-white/10 focus:bg-white/15"
  >
    <span className="flex h-[25px] items-center">
      <Glyph letter={letter} />
    </span>
    <span className="actionbuttonlegenditem_ActionButtonLabel_gh ml-2 flex items-center text-[12px] font-bold uppercase leading-[22px] tracking-[0.5px] text-white">
      {label}
    </span>
  </button>
);

export default function MediaGallery({
  items,
  title,
  romId,
  canManage = false,
}: {
  items: MediaItem[];
  title: string;
  romId: number;
  canManage?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const t = useTranslations("gameMedia.gallery");

  const activeItem = open === null ? null : items[open];
  const videoOpen = activeItem?.kind === "video" || activeItem?.kind === "youtube";

  // A playing trailer and the page's title theme music would talk over each
  // other — tell GameTheme to pause while a video is on screen, and resume once
  // it's closed (or we've switched to a still screenshot).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("gh-theme-suspend", { detail: videoOpen }));
    return () => {
      if (videoOpen) window.dispatchEvent(new CustomEvent("gh-theme-suspend", { detail: false }));
    };
  }, [videoOpen]);

  const show = useCallback((i: number) => { setOpen(i); setDetails(false); setConfirming(false); setDims(null); }, []);
  const close = useCallback(() => { setOpen(null); setConfirming(false); setDetails(false); }, []);
  const step = useCallback(
    (dir: number) =>
      setOpen((cur) => {
        if (cur === null) return cur;
        setConfirming(false); setDims(null);
        return (cur + dir + items.length) % items.length;
      }),
    [items.length],
  );

  const doDelete = useCallback(async () => {
    if (open === null) return;
    const kind = items[open].kind === "video" ? "video" : "screenshot";
    await fetch(`/api/roms/${romId}/media?type=${kind}`, { method: "DELETE" });
    playSound("back");
    setConfirming(false);
    setOpen(null);
    router.refresh();
  }, [open, items, romId, router]);

  const confirmingRef = useRef(confirming);
  useEffect(() => {
    confirmingRef.current = confirming;
  }, [confirming]);

  useEffect(() => {
    if (open === null) return;
    backRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (confirmingRef.current) {
        if (e.key === "Enter") { e.preventDefault(); void doDelete(); }
        else if (e.key === "Escape" || e.key === "Backspace") { e.preventDefault(); setConfirming(false); }
        return;
      }
      if (e.key === "Escape" || e.key === "Backspace") { e.preventDefault(); close(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key.toLowerCase() === "y" || e.key === "Enter") { e.preventDefault(); setDetails((d) => !d); }
      else if (canManage && e.key === "Delete" && items[open]?.kind !== "youtube") { e.preventDefault(); setConfirming(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, step, doDelete, canManage, items]);

  return (
    <div className="appdetailssection_Body_gh flex flex-col p-[10px]">
      {/* Deck: a 2-column grid, gap 12px. Thumbnails keep the image's natural
          aspect on a near-black backing (letterboxed when aspects differ). */}
      <div className="appdetailsscreenshotssection_Screenshots_gh mb-[5px] grid grid-cols-2 gap-3 overflow-hidden">
        {items.map((m, i) => {
          const isVideo = m.kind === "video" || m.kind === "youtube";
          const ytId = m.kind === "youtube" ? youTubeId(m.url) : null;
          const thumb =
            m.kind === "image"
              ? m.url
              : m.poster ?? (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : "");
          return (
          <button
            key={i}
            onClick={() => show(i)}
            title={isVideo ? t("playTrailerTitle", { title }) : t("screenshotTitle", { title })}
            className="appdetailsscreenshotssection_Thumbnail_gh screenshots_ClickableScreenshot_gh Focusable group relative flex cursor-pointer items-center justify-center overflow-hidden bg-[rgba(1,1,1,0.6)] outline-none transition-shadow duration-150 focus:ring-2 focus:ring-inset focus:ring-white"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb}
              alt=""
              loading="lazy"
              className="screenshots_ClickableScreenshotImg_gh screenshots_UseWidth_gh block w-full transition-transform duration-200 group-hover:scale-[1.02]"
            />
            {isVideo && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/40 transition-colors group-hover:bg-[#59bf40] group-hover:text-[#0e141b]">
                  <PlayGlyph className="ml-0.5 h-6 w-6" />
                </span>
              </span>
            )}
          </button>
          );
        })}
      </div>

      {/* Deck: a Secondary "Manage my media" button, bottom-right (bg rgb(61,68,80),
          radius 2px, pad 10/24, margin-top 8px). Opens the game options modal —
          GameHub's home for fetching/replacing this game's media. */}
      <button
        onClick={() => window.dispatchEvent(new Event("gh-open-game-options"))}
        className="appdetailsbutton_AppDetailsButton_gh appdetailsbutton_BottomRight_gh gamepaddialog_Button_gh DialogButton Secondary Focusable mt-2 cursor-pointer self-end rounded-[2px] bg-[#3d4450] px-6 py-[10px] text-[16px] leading-none text-white outline-none transition-colors hover:bg-[#464e5c] focus:ring-2 focus:ring-inset focus:ring-white"
      >
        {t("manageMedia")}
      </button>

      {activeItem && (
        <div className="appdetailsscreenshotssection_ScreenshotModal_gh backgroundglass_BackgroundGlass_gh fixed inset-0 z-[7000] flex flex-col bg-black/70 backdrop-blur-[8px]">
          {/* Frame: the media fills the entire area above the footer. bg
              rgba(0,0,0,0.6) with an inset vignette darkening the edges. */}
          <div
            className="relative flex flex-1 items-center justify-center overflow-hidden bg-[rgba(0,0,0,0.6)] shadow-[inset_0_0_80px_0_rgba(0,0,0,0.733)]"
            onClick={close}
          >
            <div className="h-full w-full" onClick={(e) => e.stopPropagation()}>
              {activeItem.kind === "youtube" ? (
                <iframe
                  key={open}
                  src={`https://www.youtube-nocookie.com/embed/${youTubeId(activeItem.url) ?? ""}?autoplay=1&rel=0`}
                  title={t("trailerTitle", { title })}
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              ) : activeItem.kind === "video" ? (
                <video
                  key={open}
                  src={activeItem.url}
                  poster={activeItem.poster ?? undefined}
                  controls
                  autoPlay
                  className="h-full w-full object-contain"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeItem.url}
                  alt={t("screenshotTitle", { title })}
                  onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            {/* (Y) Show — a full-width details bar across the bottom, with Delete */}
            {details && (
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-4 bg-black/75 px-8 py-4 backdrop-blur-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[18px] font-semibold text-white">{title}</div>
                  <div className="mt-0.5 text-[13px] text-white/70">
                    {activeItem.kind === "image" ? t("screenshotLabel") : t("trailerLabel")}
                    {items.length > 1 && t("position", { current: open! + 1, total: items.length })}
                    {activeItem.kind === "image" && dims && ` · ${dims.w}×${dims.h}`}
                  </div>
                </div>
                {canManage && activeItem.kind !== "youtube" && (
                  <button
                    onClick={() => setConfirming(true)}
                    className="Focusable flex shrink-0 cursor-pointer items-center gap-2 rounded-[2px] bg-[#3d4450] px-5 py-2.5 text-[14px] font-semibold text-white outline-none transition-colors hover:bg-[#c0392b] focus:bg-[#c0392b] focus:ring-2 focus:ring-inset focus:ring-white"
                  >
                    <TrashIcon />
                    {t("delete")}
                  </button>
                )}
              </div>
            )}

            {/* Delete confirmation */}
            {confirming && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60" onClick={(e) => { e.stopPropagation(); setConfirming(false); }}>
                <div className="w-[360px] max-w-[90vw] rounded-[4px] bg-[#23262e] p-6 text-center shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
                  <div className="text-[17px] font-semibold text-white">
                    {activeItem.kind === "video" ? t("deleteTrailerConfirm") : t("deleteScreenshotConfirm")}
                  </div>
                  <div className="mt-1 text-[13px] text-white/60">{t("removesFromGame")}</div>
                  <div className="mt-5 flex justify-center gap-3">
                    <button
                      onClick={() => void doDelete()}
                      className="Focusable cursor-pointer rounded-[2px] bg-[#c0392b] px-5 py-2 text-[14px] font-semibold text-white outline-none transition-colors hover:bg-[#d64535] focus:ring-2 focus:ring-inset focus:ring-white"
                    >
                      {t("delete")}
                    </button>
                    <button
                      onClick={() => setConfirming(false)}
                      className="Focusable cursor-pointer rounded-[2px] bg-[#3d4450] px-5 py-2 text-[14px] font-semibold text-white outline-none transition-colors hover:bg-[#464e5c] focus:ring-2 focus:ring-inset focus:ring-white"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer legend — Show / Select / Back (controller-driven) */}
          <div
            className="footer_BasicFooter_gh flex h-[42px] shrink-0 items-center px-[1.7vw] backdrop-blur-[100px]"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          >
            <div className="footer_FooterLegend_gh flex h-[35px] w-full items-center py-[3px]">
              <div className="min-w-0 flex-1" />
              <LegendChip letter="Y" label={t("legendShow")} onClick={() => setDetails((d) => !d)} />
              <LegendChip letter="A" label={t("legendSelect")} onClick={() => setDetails((d) => !d)} />
              <LegendChip letter="B" label={t("legendBack")} onClick={close} chipRef={backRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
