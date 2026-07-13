"use client";

// Shared body for the mobile artwork-picker sub-sheets used by both the game
// options and system options bottom sheets. The parent owns the sheet chrome +
// candidate fetching; this renders the back bar, any extra header actions, a
// status line, and the tap-to-apply candidate grid. Mirrors the desktop
// GameOptionsModal / SystemTools picker views, sized for touch.

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

export interface ArtCandidate {
  url: string;
  provider: string;
}

/** Shape of the art being chosen — drives the tile aspect ratio + fit. */
export type ArtAspect = "video" | "portrait" | "logo";

export default function MobileArtPicker({
  candidates,
  msg,
  aspect,
  busy = false,
  onBack,
  onPick,
  headerActions,
  leadTile,
}: {
  /** null while the provider search is in flight (renders a spinner). */
  candidates: ArtCandidate[] | null;
  /** status / error line shown above the grid. */
  msg?: string;
  aspect: ArtAspect;
  /** a pick is being applied — locks the grid so a double-tap can't fire twice. */
  busy?: boolean;
  onBack: () => void;
  onPick: (url: string) => void;
  /** extra header buttons, e.g. "Remove current" / "No logo". */
  headerActions?: ReactNode;
  /** optional first grid tile, e.g. "Use generated ribbon/cover". */
  leadTile?: ReactNode;
}) {
  const t = useTranslations("mobileMisc");
  const cols = aspect === "portrait" ? "grid-cols-3" : "grid-cols-2";
  // Drop candidates whose image 404s (e.g. libretro thumbnails that don't exist)
  // so we never show a broken tile or let one be picked into a failed download.
  const [broken, setBroken] = useState<Record<string, true>>({});
  const shown = (candidates ?? []).filter((c) => !broken[c.url]);
  const markBroken = (url: string) => setBroken((b) => (b[url] ? b : { ...b, [url]: true }));

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-2 py-1 text-[13px] font-semibold text-accent active:opacity-70"
        >
          ‹ {t("common.back")}
        </button>
        {headerActions && <div className="flex flex-wrap items-center justify-end gap-1.5">{headerActions}</div>}
      </div>

      {msg && <p className="px-5 pb-2 text-[13px] text-dim">{msg}</p>}

      {candidates === null ? (
        <div className="flex items-center justify-center py-12">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-accent" aria-hidden />
        </div>
      ) : (
        <div className={`grid ${cols} gap-2.5 px-4 pb-3 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {leadTile}
          {shown.map((c, i) => (
            <button
              key={`${c.url}-${i}`}
              onClick={() => onPick(c.url)}
              disabled={busy}
              className="overflow-hidden rounded-[8px] bg-black/40 text-left ring-1 ring-white/5 active:ring-2 active:ring-accent/70 disabled:cursor-default"
              title={c.provider}
            >
              {aspect === "logo" ? (
                <div className="flex h-24 items-center justify-center p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.url} alt={c.provider} loading="lazy" onError={() => markBroken(c.url)} className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.url}
                    alt={c.provider}
                    loading="lazy"
                    onError={() => markBroken(c.url)}
                    className={`w-full object-cover ${aspect === "video" ? "aspect-video" : "aspect-[3/4]"}`}
                  />
                  <div className="truncate px-2 py-1 text-[10px] font-semibold text-dim">{c.provider}</div>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small pill button for the picker header actions (remove / clear / no-art). */
export function ArtHeaderButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-[6px] bg-[#232a34] px-2.5 py-1.5 text-[12px] font-semibold text-body active:opacity-80"
    >
      {children}
    </button>
  );
}
