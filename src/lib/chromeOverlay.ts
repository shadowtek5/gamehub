"use client";

// Shared "a full-screen chrome overlay is open" signal, used so the fixed
// header (SystemBar) and footer (LegendFooter) can turn near-opaque while the
// Main Menu or Quick Access panel is up — giving those panels a clean backdrop
// instead of the transparent (hero-page) or 94% bars they normally show.
//
// Each panel flips its own body flag (data-mainmenu / data-quickaccess) so the
// two are independent; the chrome reads "is EITHER open?". A window event lets
// the chrome react without prop-drilling through the layout.

import { useEffect, useState } from "react";

const EVENT = "gh-chrome-overlay";
const SOURCES = ["mainmenu", "quickaccess"] as const;
type OverlaySource = (typeof SOURCES)[number];

/** Set/clear a panel's open flag and notify the chrome. */
export function setChromeOverlay(source: OverlaySource, open: boolean) {
  if (typeof document === "undefined") return;
  if (open) document.body.dataset[source] = "open";
  else delete document.body.dataset[source];
  window.dispatchEvent(new Event(EVENT));
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
