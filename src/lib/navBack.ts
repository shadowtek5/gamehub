"use client";

// Console-style hierarchical back (B button / Backspace / bottom-bar BACK):
// 1. an open overlay closes (it intercepts the cancellable gh-b event)
// 2. leaf pages go to their parent (properties -> game, system -> systems)
// 3. game pages use history (returns to whichever shelf you came from)
// 4. top-level sections go Home; at Home, back does nothing

import { playSound } from "./sounds";
import { backTarget } from "./navTrail";
import { markBackTo } from "./scrollMemory";

export function goBackSmart(push: (href: string) => void) {
  // Push-to-parent Back: flag the destination so ScrollRestorer knows this is a
  // Back (restore the list's scroll) and not a fresh forward entry.
  const back = (href: string) => {
    markBackTo(href);
    push(href);
  };
  const handledByOverlay = !window.dispatchEvent(
    new CustomEvent("gh-b", { cancelable: true })
  );
  if (handledByOverlay) return; // overlay played its own close sound

  const p = window.location.pathname;
  if (p === "/") {
    playSound("bumperEnd");
    return;
  }
  playSound("back");

  const play = p.match(/^\/play\/(\d+)/);
  if (play) {
    // Same pop-then-full-reload as the player's Exit button: keeps the
    // history clean and fully tears the running player down.
    const target = `/game/${play[1]}`;
    let handled = false;
    window.addEventListener(
      "popstate",
      () => {
        handled = true;
        window.location.replace(target);
      },
      { once: true }
    );
    window.history.back();
    setTimeout(() => {
      if (!handled) window.location.replace(target);
    }, 400);
    return;
  }
  const gameProps = p.match(/^\/game\/(\d+)\/properties/);
  if (gameProps) {
    // Pop the history entry rather than pushing the game page on top of it —
    // a push leaves properties underneath, so B on the game page (which uses
    // history.back) would flip between the two forever.
    window.history.back();
    setTimeout(() => {
      // Opened directly (no in-app history)? Fall back to the game page.
      if (window.location.pathname === p) push(`/game/${gameProps[1]}`);
    }, 300);
    return;
  }
  if (/^\/game\/\d+/.test(p)) {
    // Prefer the recorded trail over history.back(): the browser stack can
    // desync (fast double-click on Back, /game→/game hops via the Related
    // shelf) and pop past /systems/<slug> all the way to /systems. The trail
    // knows exactly where we came from; only fall back to history when it's
    // unknown (deep link / fresh tab).
    const target = backTarget();
    if (target && target !== p) back(target);
    else window.history.back();
    return;
  }
  if (p.startsWith("/profile/edit")) {
    window.history.back();
    setTimeout(() => {
      if (window.location.pathname === p) push("/profile");
    }, 300);
    return;
  }
  if (/^\/systems\/.+/.test(p)) {
    back("/systems");
    return;
  }
  if (/^\/collections\/.+/.test(p)) {
    back("/collections");
    return;
  }
  // /library, /systems, /collections, /settings, anything else -> Home
  push("/");
}
