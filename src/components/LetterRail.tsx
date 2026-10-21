"use client";

// A–Z jump strip for name-sorted game grids (system, collection pages; desktop
// and mobile). Steam-style quiet chrome: it fades in while the page scrolls or
// the mouse nears the right edge, and fades out again when idle. Tap a letter,
// or drag along the strip (a large bubble shows the letter under the finger),
// and the grid jumps there. Letters with no games are dimmed. Pointer/touch
// only — data-nav-skip keeps it out of gamepad navigation.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";

export interface LetterEntry {
  /** "A"…"Z", or "#" for digits/symbols/accented first letters */
  letter: string;
  /** index of the first game with this letter in the name-sorted list */
  offset: number;
  count: number;
}

const ALL = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const HIDE_AFTER_MS = 1600;
const EDGE_PX = 80;

/** Fetches where each letter starts for the grid's current filters (null params = off). */
export function useLetterIndex(params: string | null): LetterEntry[] {
  // Keyed by the params they were fetched for, so stale letters never show for new filters.
  const [result, setResult] = useState<{ params: string; letters: LetterEntry[] } | null>(null);
  useEffect(() => {
    if (!params) return;
    let live = true;
    fetch(`/api/library?${params}&letters=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (live) setResult({ params, letters: Array.isArray(d.letters) ? d.letters : [] });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [params]);
  return params && result?.params === params ? result.letters : [];
}

export default function LetterRail({
  letters,
  onJump,
  className = "right-1.5",
  gridRef,
}: {
  letters: LetterEntry[];
  onJump: (entry: LetterEntry) => void;
  /** horizontal placement (the mobile app nudges it) */
  className?: string;
  /** The game grid: the strip only appears once the grid fills the middle of the screen, so it
   *  never covers the page header (e.g. the system page's ⚙ menu on the right). */
  gridRef?: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("common");
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const dragging = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const byLetter = new Map(letters.map((l) => [l.letter, l]));

  const show = useCallback(() => {
    const grid = gridRef?.current;
    if (grid) {
      const r = grid.getBoundingClientRect();
      const mid = window.innerHeight / 2;
      if (r.top > mid || r.bottom < mid) {
        if (!dragging.current) setVisible(false);
        return;
      }
    }
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!dragging.current) setVisible(false);
    }, HIDE_AFTER_MS);
  }, [gridRef]);

  useEffect(() => {
    const onScroll = () => show();
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && window.innerWidth - e.clientX < EDGE_PX) show();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [show]);

  /** The available letter nearest the pointer's position along the strip. */
  const letterAt = (clientY: number): string | null => {
    const el = rail.current;
    if (!el || letters.length === 0) return null;
    const r = el.getBoundingClientRect();
    const i = Math.min(ALL.length - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * ALL.length)));
    for (let d = 0; d < ALL.length; d++) {
      for (const j of [i - d, i + d]) {
        if (j >= 0 && j < ALL.length && byLetter.has(ALL[j])) return ALL[j];
      }
    }
    return null;
  };

  const finish = () => {
    dragging.current = false;
    const entry = active ? byLetter.get(active) : undefined;
    setActive(null);
    if (entry) onJump(entry);
    show();
  };

  if (letters.length < 2) return null;
  return (
    <>
      <div
        ref={rail}
        data-nav-skip
        role="navigation"
        aria-label={t("jumpToLetter")}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          dragging.current = true;
          setActive(letterAt(e.clientY));
          show();
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const l = letterAt(e.clientY);
          if (l !== active) setActive(l);
          show();
        }}
        onPointerUp={finish}
        onPointerCancel={() => {
          dragging.current = false;
          setActive(null);
        }}
        className={`fixed top-1/2 z-40 flex h-[min(62vh,480px)] -translate-y-1/2 touch-none select-none flex-col items-center justify-between rounded-full bg-black/55 px-1 py-2 ring-1 ring-white/10 backdrop-blur-sm transition-opacity duration-300 motion-reduce:transition-none ${
          visible || active ? "opacity-100" : "pointer-events-none opacity-0"
        } ${className}`}
      >
        {ALL.map((l) => (
          <span
            key={l}
            className={`flex w-5 flex-1 cursor-pointer items-center justify-center text-[10px] font-bold leading-none ${
              active === l ? "text-accent" : byLetter.has(l) ? "text-body" : "text-white/20"
            }`}
          >
            {l}
          </span>
        ))}
      </div>
      {active && (
        <div
          aria-hidden
          className="pointer-events-none fixed right-16 top-1/2 z-40 flex h-20 w-20 -translate-y-1/2 items-center justify-center rounded-[6px] bg-black/75 text-[44px] font-black text-bright ring-1 ring-white/15 backdrop-blur-sm"
        >
          {active}
        </div>
      )}
    </>
  );
}
