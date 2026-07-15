// Emulator controller-layout model (isomorphic — imported by client + server).
//
// Maps each remappable PHYSICAL controller input to an emulated console
// (RetroPad) button. Layouts are resolved at play time through three
// server-persisted layers, then a built-in default:
//   per-game  ->  per-system  ->  global (per controller family)  ->  default
// Directions (D-Pad + both sticks for movement) are fixed and NOT part of a
// layout — they mirror the app-navigation map (see src/lib/gamepadMap.ts).

/** RetroPad buttons an input can be bound to ("none" = unbound). */
export type ConsoleButton =
  | "b" | "a" | "y" | "x"
  | "l" | "r" | "l2" | "r2"
  | "select" | "start" | "l3" | "r3"
  | "none";

export type ControllerFamily = "xinput" | "playstation" | "nintendo" | "generic";

/** Stable name for each remappable physical input. */
export type PhysicalKey =
  | "south" | "east" | "west" | "north"
  | "lb" | "rb" | "lt" | "rt"
  | "select" | "start" | "l3" | "r3";

/** Which cluster of the on-screen diagram an input belongs to. */
export type DiagramRegion = "left" | "right" | "face" | "leftStick" | "rightStick";

export interface PhysicalInput {
  key: PhysicalKey;
  /** Standard Gamepad API button index (https://w3c.github.io/gamepad/#remapping). */
  index: number;
  /** Neutral position label, used when a family has no specific glyph. */
  label: string;
  region: DiagramRegion;
}

export const PHYSICAL_INPUTS: PhysicalInput[] = [
  { key: "north", index: 3, label: "North", region: "face" },
  { key: "west", index: 2, label: "West", region: "face" },
  { key: "east", index: 1, label: "East", region: "face" },
  { key: "south", index: 0, label: "South", region: "face" },
  { key: "lb", index: 4, label: "Left Bumper", region: "left" },
  { key: "lt", index: 6, label: "Left Trigger", region: "left" },
  { key: "select", index: 8, label: "Select", region: "left" },
  { key: "rb", index: 5, label: "Right Bumper", region: "right" },
  { key: "rt", index: 7, label: "Right Trigger", region: "right" },
  { key: "start", index: 9, label: "Start", region: "right" },
  { key: "l3", index: 10, label: "Left Stick Click", region: "leftStick" },
  { key: "r3", index: 11, label: "Right Stick Click", region: "rightStick" },
];

export const PHYSICAL_BY_KEY = Object.fromEntries(
  PHYSICAL_INPUTS.map((p) => [p.key, p])
) as Record<PhysicalKey, PhysicalInput>;

/** A full mapping: every physical input -> the console button it emits. */
export type Layout = Record<PhysicalKey, ConsoleButton>;

/** RetroPad targets shown in the picker (order = how they read on a pad). */
export const CONSOLE_BUTTONS: { key: ConsoleButton; label: string }[] = [
  { key: "b", label: "B" },
  { key: "a", label: "A" },
  { key: "y", label: "Y" },
  { key: "x", label: "X" },
  { key: "l", label: "L" },
  { key: "r", label: "R" },
  { key: "l2", label: "L2" },
  { key: "r2", label: "R2" },
  { key: "l3", label: "L3" },
  { key: "r3", label: "R3" },
  { key: "select", label: "Select" },
  { key: "start", label: "Start" },
  { key: "none", label: "Unbound" },
];

export const CONSOLE_LABEL = Object.fromEntries(
  CONSOLE_BUTTONS.map((c) => [c.key, c.label])
) as Record<ConsoleButton, string>;

const CONSOLE_SET = new Set<ConsoleButton>(CONSOLE_BUTTONS.map((c) => c.key));

// Xbox is the lingua franca; generic reuses it. Only the labels change per
// family — the physical indices are identical under the standard mapping.
const XINPUT_LABELS: Record<PhysicalKey, string> = {
  south: "A", east: "B", west: "X", north: "Y",
  lb: "LB", rb: "RB", lt: "LT", rt: "RT",
  select: "View", start: "Menu", l3: "L3", r3: "R3",
};

export const FAMILY_LABELS: Record<ControllerFamily, Record<PhysicalKey, string>> = {
  xinput: XINPUT_LABELS,
  generic: XINPUT_LABELS,
  playstation: {
    south: "✕", east: "○", west: "□", north: "△",
    lb: "L1", rb: "R1", lt: "L2", rt: "R2",
    select: "Share", start: "Options", l3: "L3", r3: "R3",
  },
  nintendo: {
    south: "B", east: "A", west: "Y", north: "X",
    lb: "L", rb: "R", lt: "ZL", rt: "ZR",
    select: "−", start: "+", l3: "L3", r3: "R3",
  },
};

export const FAMILY_NAMES: Record<ControllerFamily, string> = {
  xinput: "Xbox / X-Input",
  playstation: "PlayStation",
  nintendo: "Nintendo Pro",
  generic: "Generic",
};

/** The physical input's label for a given controller family. */
export function physicalLabel(key: PhysicalKey, family: ControllerFamily): string {
  return FAMILY_LABELS[family][key] ?? PHYSICAL_BY_KEY[key].label;
}

// Built-in default: RetroArch's usual layout (bottom face = B, right = A, …),
// matching the emulator's previous hardcoded bridge. Identical across families
// because the standard-mapping indices don't move — only the printed labels do.
const BASE_DEFAULT: Layout = {
  south: "b", east: "a", west: "y", north: "x",
  lb: "l", rb: "r", lt: "l2", rt: "r2",
  select: "select", start: "start", l3: "l3", r3: "r3",
};

export const DEFAULT_LAYOUTS: Record<ControllerFamily, Layout> = {
  xinput: { ...BASE_DEFAULT },
  playstation: { ...BASE_DEFAULT },
  nintendo: { ...BASE_DEFAULT },
  generic: { ...BASE_DEFAULT },
};

export function defaultLayout(family: ControllerFamily): Layout {
  return { ...DEFAULT_LAYOUTS[family] };
}

/** Guess the controller family from the Gamepad.id string. */
export function detectFamily(id: string): ControllerFamily {
  const s = (id || "").toLowerCase();
  if (/dualsense|dualshock|playstation|sony|\b054c\b|0ce6/.test(s)) return "playstation";
  if (/nintendo|switch|joy-?con|pro controller|\b057e\b/.test(s)) return "nintendo";
  if (/xbox|xinput|x-input|microsoft|\b045e\b|028e/.test(s)) return "xinput";
  return "generic";
}

/** Coerce arbitrary JSON into a valid Layout (missing/invalid → default). */
export function sanitizeLayout(input: unknown): Layout {
  const out: Layout = { ...BASE_DEFAULT };
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    for (const p of PHYSICAL_INPUTS) {
      const v = obj[p.key];
      if (typeof v === "string" && CONSOLE_SET.has(v as ConsoleButton)) {
        out[p.key] = v as ConsoleButton;
      }
    }
  }
  return out;
}

// ---- share codes: export/import a layout as a compact, paste-able string ----
const SHARE_PREFIX = "GHCL1.";

/** Encode a layout as a shareable code (base64url of its JSON, versioned). */
export function encodeLayoutCode(layout: Layout): string {
  try {
    const json = JSON.stringify(layout);
    const b64 =
      typeof btoa !== "undefined" ? btoa(json) : Buffer.from(json, "utf8").toString("base64");
    return SHARE_PREFIX + b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return "";
  }
}

/** Decode a share code back into a (sanitized, complete) layout, or null. */
export function decodeLayoutCode(code: string): Layout | null {
  const s = code.trim();
  if (!s.startsWith(SHARE_PREFIX)) return null;
  let b64 = s.slice(SHARE_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  try {
    const json =
      typeof atob !== "undefined" ? atob(b64) : Buffer.from(b64, "base64").toString("utf8");
    return sanitizeLayout(JSON.parse(json));
  } catch {
    return null;
  }
}

export type LayoutSource = "game" | "system" | "default" | "global";

/** Resolve the effective layout from the persisted override layers. */
export function resolveLayout(
  overrides: { game?: Layout | null; system?: Layout | null; global?: Layout | null },
  family: ControllerFamily
): { layout: Layout; source: LayoutSource } {
  if (overrides.game) return { layout: overrides.game, source: "game" };
  if (overrides.system) return { layout: overrides.system, source: "system" };
  if (overrides.global) return { layout: overrides.global, source: "global" };
  return { layout: defaultLayout(family), source: "default" };
}

/** Invert a layout into `physical button index -> console button` (drops
 *  unbound inputs). Used by the emulator's pad→key bridge. */
export function layoutToIndexMap(layout: Layout): Map<number, Exclude<ConsoleButton, "none">> {
  const m = new Map<number, Exclude<ConsoleButton, "none">>();
  for (const p of PHYSICAL_INPUTS) {
    const cb = layout[p.key];
    if (cb && cb !== "none") m.set(p.index, cb as Exclude<ConsoleButton, "none">);
  }
  return m;
}
