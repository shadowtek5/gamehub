"use client";

// Shared "a full-screen chrome overlay is open" signal, used so the fixed
// header (SystemBar) and footer (LegendFooter) can turn near-opaque while the
// Main Menu or Quick Access panel is up — giving those panels a clean backdrop
// instead of the transparent (hero-page) or 94% bars they normally show.
//
// Each panel flips its own body flag (data-mainmenu / data-quickaccess) so the
// two are independent; the chrome reads "is EITHER open?". A window event lets
// the chrome react without prop-drilling through the layout.

import { useEffect, useRef, useState } from "react";

const EVENT = "gh-chrome-overlay";
// Exclusivity signal: carries the source that just took over (or null for a
// "close everything" request). Panels close themselves when another source
// opens, so only one chrome overlay is ever up at a time.
const EXCLUSIVE = "gh-overlay-exclusive";
const SOURCES = ["mainmenu", "quickaccess"] as const;
type OverlaySource = (typeof SOURCES)[number];

/** Set/clear a panel's open flag and notify the chrome. Opening a panel also
 *  asks every OTHER tracked panel to close (mutual exclusion). */
export function setChromeOverlay(source: OverlaySource, open: boolean) {
  if (typeof document === "undefined") return;
  if (open) document.body.dataset[source] = "open";
  else delete document.body.dataset[source];
  window.dispatchEvent(new Event(EVENT));
  if (open) window.dispatchEvent(new CustomEvent(EXCLUSIVE, { detail: source }));
}

/** Close every tracked chrome overlay — e.g. when tapping the profile avatar. */
export function closeChromeOverlays() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EXCLUSIVE, { detail: null }));
}

/** Close `self` whenever a different panel opens (or a close-all is requested). */
export function useExclusiveOverlay(self: OverlaySource, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const on = (e: Event) => {
      const src = (e as CustomEvent<OverlaySource | null>).detail;
      if (src !== self) closeRef.current();
    };
    window.addEventListener(EXCLUSIVE, on);
    return () => window.removeEventListener(EXCLUSIVE, on);
  }, [self]);
}

/** True when any tracked panel is currently open. */
export function chromeOverlayOpen(): boolean {
  if (typeof document === "undefined") return false;
  return SOURCES.some((s) => document.body.dataset[s] === "open");
}

/** React hook: re-renders the chrome when a panel opens or closes. */
export function useChromeOverlayOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const update = () => setOpen(chromeOverlayOpen());
    update();
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return open;
}

// The in-game Quick Menu (over the fullscreen emulator, z-100) uses this to ask
// the real system chrome (SystemBar / LegendFooter) to lift above the emulator
// and, for the footer, to show on /play — so the running game gets GameHub's
// actual header/footer instead of bespoke ones.
const INGAME_EVENT = "gh-ingame-menu";
export function setInGameMenu(open: boolean) {
  if (typeof document === "undefined") return;
  if (open) document.body.dataset.ingamemenu = "open";
  else delete document.body.dataset.ingamemenu;
  window.dispatchEvent(new Event(INGAME_EVENT));
}
export function useInGameMenuOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const read = () => setOpen(document.body.dataset.ingamemenu === "open");
    read();
    window.addEventListener(INGAME_EVENT, read);
    return () => window.removeEventListener(INGAME_EVENT, read);
  }, []);
  return open;
}
