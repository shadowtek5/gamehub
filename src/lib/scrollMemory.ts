"use client";

// Per-path scroll restoration for the app's hierarchical Back.
//
// Why this exists: console-style Back (navBack.goBackSmart) navigates with
// router.push(parent) rather than history.back() — the App Router history stack
// desyncs here (see navTrail), so Back is a deterministic forward push. But a
// push always lands the new page at scrollTop 0, so returning from a game to the
// library/system, or from a system to the systems grid, lost your place.
//
// We record the scroll offset for each path as you scroll, and when Back pushes
// you to a path we flag it — the ScrollRestorer then re-applies the saved offset
// (retrying while lazy-loaded content grows the page tall enough to reach it).
// Only a flagged Back restores; a fresh forward entry (tapping Library in the
// nav) still starts at the top.

const KEY = "gh-scroll-pos";

function read(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(KEY);
    const o = raw ? (JSON.parse(raw) as unknown) : null;
    return o && typeof o === "object" ? (o as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function write(map: Record<string, number>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // sessionStorage unavailable/full — restoration just no-ops.
  }
}

/** Remember the scroll offset for a path (called continuously while scrolling). */
export function saveScrollFor(path: string, y: number): void {
  const map = read();
  if (y <= 0) delete map[path];
  else map[path] = Math.round(y);
  write(map);
}

/** The saved scroll offset for a path, or null if none. */
export function savedScrollFor(path: string): number | null {
  const y = read()[path];
  return typeof y === "number" ? y : null;
}

// The infinite-scroll grids (desktop LibraryBrowser, mobile MobileLibrary) load
// in chunks and re-fetch from offset 0 on mount, so a returning page is only one
// chunk tall — too short to scroll back to a deep offset. We also remember how
// many items were loaded so the grid can re-request that many first, growing the
// page tall enough for the scroll restore to reach.
const COUNT_KEY = "gh-loaded-count";

export function saveCountFor(path: string, n: number): void {
  try {
    const raw = sessionStorage.getItem(COUNT_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[path] = n;
    sessionStorage.setItem(COUNT_KEY, JSON.stringify(map));
  } catch {}
}

export function savedCountFor(path: string): number | null {
  try {
    const raw = sessionStorage.getItem(COUNT_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const n = map[path];
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

// Back-navigation intent: goBackSmart flags the path it's pushing to so the
// ScrollRestorer knows this arrival is a Back (restore) rather than a fresh
// forward entry (stay at top). One-shot — consumed by the first matching arrival.
let pendingRestore: string | null = null;

/** Flag that the next arrival at `path` is a Back and should restore scroll. */
export function markBackTo(path: string): void {
  pendingRestore = path;
}

/** Consume the Back flag if it matches `path` (true = restore this arrival). */
export function takeBackTo(path: string): boolean {
  if (pendingRestore === path) {
    pendingRestore = null;
    return true;
  }
  return false;
}
