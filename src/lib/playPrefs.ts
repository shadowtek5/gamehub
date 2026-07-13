// Client-side gameplay preferences for the in-browser player. These are per
// device (localStorage) since they tune how the emulator runs on the hardware
// you're playing on — a beefy desktop can afford rewind, a NAS/Deck may not.

export const REWIND_KEY = "gh-rewind";

/** Rewind buffers recent frames so you can scrub backwards — great, but it
 *  costs extra memory + CPU, so it's off by default and opt-in per device. */
export function rewindEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(REWIND_KEY) === "on";
}

export function setRewindEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REWIND_KEY, on ? "on" : "off");
}
