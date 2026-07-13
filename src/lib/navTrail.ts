"use client";

// A lightweight in-app navigation trail kept in sessionStorage, used to make
// "Back" from a game page deterministic. window.history.back() is unreliable
// here: the App Router history stack can desync (a fast double-click on Back,
// soft navigations between /game/<a> and /game/<b> via the Related shelf, the
// media/theme popstate shims), so a mouse Back sometimes popped TWO entries and
// landed on /systems instead of the /systems/<slug> you came from. We instead
// record each visited pathname and, on Back, navigate straight to the entry we
// actually came from.

const KEY = "gh-nav-trail";
const MAX = 50;

function read(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function write(trail: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-MAX)));
  } catch {
    // sessionStorage unavailable/full — Back just falls back to history.back()
  }
}

/**
 * Record a visit. Re-visiting an earlier entry (Back / Forward, or our own
 * push-based Back) truncates the trail to it rather than growing it, so the
 * stack mirrors real navigation instead of ratcheting up forever.
 */
export function recordNav(path: string) {
  const trail = read();
  if (trail[trail.length - 1] === path) return; // same page (e.g. router.refresh)
  const idx = trail.lastIndexOf(path);
  if (idx !== -1) trail.length = idx + 1; // returned to an entry already in the trail
  else trail.push(path);
  write(trail);
}

/** The page immediately before the current one, or null if unknown. */
export function backTarget(): string | null {
  const trail = read();
  return trail.length >= 2 ? trail[trail.length - 2] : null;
}
