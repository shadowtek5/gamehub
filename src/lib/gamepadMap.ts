// Per-device controller button map. Which physical gamepad button drives each
// GameHub action. Stored in localStorage (a mapping belongs to the controller
// on this machine, not the user account) and read by GamepadNav; the Controller
// settings page edits it live.

export type PadAction = "a" | "b" | "x" | "y" | "lb" | "rb" | "select" | "start";

export const PAD_ACTIONS: { key: PadAction; label: string; hint: string }[] = [
  { key: "a", label: "Select / Activate", hint: "Open the focused item" },
  { key: "b", label: "Back", hint: "Go back / close" },
  { key: "x", label: "Toggle favorite", hint: "Star the focused game" },
  { key: "y", label: "Jump to Library", hint: "Open the library" },
  { key: "lb", label: "Previous tab", hint: "Cycle library/status tabs left" },
  { key: "rb", label: "Next tab", hint: "Cycle library/status tabs right" },
  { key: "select", label: "Options / Quick Access", hint: "Context options or Quick Access" },
  { key: "start", label: "Main menu", hint: "Open the GameHub menu" },
];

// Standard Gamepad API mapping (https://w3c.github.io/gamepad/#remapping).
export const DEFAULT_MAP: Record<PadAction, number> = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  select: 8,
  start: 9,
};

/** Friendly names for the standard-mapping button indices. */
export const STANDARD_BUTTON_NAMES: Record<number, string> = {
  0: "A",
  1: "B",
  2: "X",
  3: "Y",
  4: "LB",
  5: "RB",
  6: "LT",
  7: "RT",
  8: "Select",
  9: "Start",
  10: "L3",
  11: "R3",
  12: "D-Pad Up",
  13: "D-Pad Down",
  14: "D-Pad Left",
  15: "D-Pad Right",
  16: "Guide",
};

/** Label a button index — its standard name when the pad reports standard
 *  mapping, otherwise a plain "Button N". */
export function buttonLabel(index: number, standardMapping: boolean): string {
  if (standardMapping && STANDARD_BUTTON_NAMES[index]) return STANDARD_BUTTON_NAMES[index];
  return `Button ${index}`;
}

const KEY = "gh-gamepad-map";
/** Fired (on window) whenever the map changes, so GamepadNav reloads it. */
export const MAP_EVENT = "gh-gamepad-map";

export function loadMap(): Record<PadAction, number> {
  if (typeof window === "undefined") return { ...DEFAULT_MAP };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_MAP };
    const parsed = JSON.parse(raw) as Partial<Record<PadAction, number>>;
    const map = { ...DEFAULT_MAP };
    for (const { key } of PAD_ACTIONS) {
      if (typeof parsed[key] === "number") map[key] = parsed[key]!;
    }
    return map;
  } catch {
    return { ...DEFAULT_MAP };
  }
}

export function saveMap(map: Record<PadAction, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {}
  window.dispatchEvent(new Event(MAP_EVENT));
}

export function resetMap(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(MAP_EVENT));
}
