// Tracks the previously-visited pathname so browse views can tell how the user
// arrived: returning from a game detail (restore their filters) vs. entering
// fresh from another area/home/settings (start clean). Recorded during render
// (see RoutePathTracker) so it's already updated before any mount effects read
// it, independent of component effect ordering.

let prev: string | null = null;
let cur: string | null = null;

export function recordPath(p: string): void {
  if (p === cur) return;
  prev = cur;
  cur = p;
}

/** The path visited immediately before the current one (null on first load). */
export function previousPath(): string | null {
  return prev;
}
