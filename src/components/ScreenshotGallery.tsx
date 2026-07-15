"use client";

// Your captured screenshots for a game (Steam-style). A grid of thumbnails that
// open a fullscreen viewer with prev/next + delete. Captures are taken in-game
// (camera button / F2 in the emulator) and served from /api/screenshots/<id>.
// Renders nothing once the list is empty, so the section disappears cleanly.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

export interface ScreenshotInfo {
  id: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

export default function ScreenshotGallery({
  romId,
  shots: initial,
  canDelete = true,
  showHeading = true,
}: {
  romId: number;
  shots: ScreenshotInfo[];
  canDelete?: boolean;
  /** false when the parent already provides a section title (DetailsSection / Section) */
  showHeading?: boolean;
}) {
  const t = useTranslations("screenshots");
  const [shots, setShots] = useState(initial);
  const [open, setOpen] = useState<number | null>(null); // index into shots
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const close = useCallback(() => setOpen(null), []);
  const step = useCallback(
    (dir: number) =>
      setOpen((cur) => (cur === null ? cur : (cur + dir + shots.length) % shots.length)),
    [shots.length]
  );

  const remove = useCallback(
    async (id: number) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/screenshots/${id}`, { method: "DELETE" });
        if (res.ok) {
          playSound("back");
          setShots((list) => {
            const next = list.filter((s) => s.id !== id);
            setOpen((cur) => (next.length === 0 ? null : cur === null ? null : Math.min(cur, next.length - 1)));
            return next;
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [busy]
  );

  // Keyboard: arrows navigate, Esc/Backspace close, Delete removes.
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") { e.preventDefault(); close(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (canDelete && e.key === "Delete") {
        e.preventDefault();
        const cur = shots[open];
        if (cur) void remove(cur.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, step, canDelete, shots, remove]);

  if (shots.length === 0) return null;
  const active = open === null ? null : shots[open];

  return (
    <div>
      {showHeading && (
        <h2 className="mb-4 text-[22px] font-bold text-bright">
          {t("title")} <span className="text-[15px] font-normal text-dim">({shots.length})</span>
        </h2>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shots.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setOpen(i)}
            className="Focusable group relative aspect-video overflow-hidden rounded-[4px] bg-[#0e141b] outline-none ring-1 ring-white/10 transition-shadow focus:ring-2 focus:ring-white"
            title={t("viewCapture")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/screenshots/${s.id}`}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            />
          </button>
        ))}
      </div>

      {mounted && active && createPortal(
        <div
          className="fixed inset-0 z-[7000] flex flex-col bg-black/85 backdrop-blur-[6px]"
          onClick={close}
        >
          <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/screenshots/${active.id}`}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
            {shots.length > 1 && (
              <>
                <button
                  onClick={() => step(-1)}
                  aria-label={t("previous")}
                  className="Focusable absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl text-white outline-none hover:bg-black/70 focus:ring-2 focus:ring-white"
                >
                  ‹
                </button>
                <button
                  onClick={() => step(1)}
                  aria-label={t("next")}
                  className="Focusable absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl text-white outline-none hover:bg-black/70 focus:ring-2 focus:ring-white"
                >
                  ›
                </button>
              </>
            )}
          </div>
          <div
            className="flex h-[52px] shrink-0 items-center gap-4 bg-black/60 px-5 backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-[13px] text-dim">
              {open! + 1} / {shots.length}
              {active.width && active.height ? ` · ${active.width}×${active.height}` : ""}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <a
                href={`/api/screenshots/${active.id}`}
                download={`screenshot-${active.id}.png`}
                className="Focusable rounded-[3px] bg-white/10 px-4 py-2 text-[13px] font-semibold text-body outline-none transition-colors hover:bg-white/20 hover:text-bright focus:ring-2 focus:ring-white"
              >
                {t("download")}
              </a>
              {canDelete && (
                <button
                  onClick={() => void remove(active.id)}
                  disabled={busy}
                  className="Focusable rounded-[3px] bg-[#3d4450] px-4 py-2 text-[13px] font-semibold text-white outline-none transition-colors hover:bg-[#c0392b] focus:bg-[#c0392b] focus:ring-2 focus:ring-white disabled:opacity-50"
                >
                  {t("delete")}
                </button>
              )}
              <button
                onClick={close}
                className="Focusable rounded-[3px] bg-white/10 px-4 py-2 text-[13px] font-semibold text-body outline-none transition-colors hover:bg-white/20 hover:text-bright focus:ring-2 focus:ring-white"
              >
                {t("close")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
