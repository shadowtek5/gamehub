"use client";

// Brand-aware controller button glyphs, Steam-style. Given the connected pad's
// family, render the correct face-button symbol + colour, the guide-button badge
// (Xbox / PlayStation / Nintendo home), and the options/menu symbol. Face glyphs
// are keyed by PHYSICAL position (south/east/west/north) so a navigation action
// always shows the button in that spot — "confirm" is the south button whether
// that reads A (Xbox), B (Nintendo) or ✕ (PlayStation).

import type { ControllerFamily } from "@/lib/controllerLayout";

export type FacePos = "south" | "east" | "west" | "north";
type Fam = ControllerFamily | null;

interface FaceStyle {
  glyph: string;
  bg: string;
  fg: string;
}

// Neutral (no pad / generic): the app's original white chips with black letters.
const NEUTRAL: Record<FacePos, FaceStyle> = {
  south: { glyph: "A", bg: "#ffffff", fg: "#0e141b" },
  east: { glyph: "B", bg: "#ffffff", fg: "#0e141b" },
  west: { glyph: "X", bg: "#ffffff", fg: "#0e141b" },
  north: { glyph: "Y", bg: "#ffffff", fg: "#0e141b" },
};

const FACE: Record<ControllerFamily, Record<FacePos, FaceStyle>> = {
  generic: NEUTRAL,
  xinput: {
    south: { glyph: "A", bg: "#5bb14a", fg: "#08210a" },
    east: { glyph: "B", bg: "#e0403f", fg: "#280808" },
    west: { glyph: "X", bg: "#3f8ee0", fg: "#06121f" },
    north: { glyph: "Y", bg: "#efc040", fg: "#241a03" },
  },
  playstation: {
    south: { glyph: "✕", bg: "#2f6fd0", fg: "#ffffff" },
    east: { glyph: "○", bg: "#d14b57", fg: "#ffffff" },
    west: { glyph: "□", bg: "#c95fa6", fg: "#ffffff" },
    north: { glyph: "△", bg: "#3fae93", fg: "#ffffff" },
  },
  // Switch physical layout: bottom=B, right=A, left=Y, top=X; buttons are a
  // single dark colour with white letters.
  nintendo: {
    south: { glyph: "B", bg: "#2f343c", fg: "#ffffff" },
    east: { glyph: "A", bg: "#2f343c", fg: "#ffffff" },
    west: { glyph: "Y", bg: "#2f343c", fg: "#ffffff" },
    north: { glyph: "X", bg: "#2f343c", fg: "#ffffff" },
  },
};

type Branded = "xinput" | "playstation" | "nintendo";
// No controller (or an unrecognised "generic" pad) defaults to Xbox / X-Input.
function eff(family: Fam): Branded {
  return family === "playstation" || family === "nintendo" ? family : "xinput";
}

function faceStyle(family: Fam, pos: FacePos): FaceStyle {
  return FACE[eff(family)][pos];
}

/** The button's mark as crisp vector geometry (PlayStation shapes drawn as
 *  paths rather than font-dependent Unicode); letters fall back to <text>. */
function GlyphMark({ glyph, fg }: { glyph: string; fg: string }) {
  const stroke = { fill: "none", stroke: fg, strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (glyph) {
    case "✕":
      return <path d="M8.5 8.5 15.5 15.5 M15.5 8.5 8.5 15.5" {...stroke} />;
    case "○":
      return <circle cx={12} cy={12} r={4.6} {...stroke} />;
    case "□":
      return <rect x={7.6} y={7.6} width={8.8} height={8.8} rx={1.2} {...stroke} />;
    case "△":
      return <path d="M12 6.6 16.8 15.6 7.2 15.6 Z" {...stroke} />;
    default:
      return (
        <text
          x={12}
          y={11.4}
          textAnchor="middle"
          dominantBaseline="central"
          fill={fg}
          fontSize={13}
          fontWeight={900}
          fontFamily="system-ui, sans-serif"
        >
          {glyph}
        </text>
      );
  }
}

/** A round face-button chip themed to the pad, at `size` px (default 25). */
export function FaceGlyph({ family, pos, size = 25 }: { family: Fam; pos: FacePos; size?: number }) {
  const s = faceStyle(family, pos);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="block">
      <circle cx={12} cy={12} r={11.5} fill={s.bg} />
      <GlyphMark glyph={s.glyph} fg={s.fg} />
    </svg>
  );
}

/** Center label as SVG text (shared by chips that show letters). */
function CenterText({ children, fg, fontSize = 13 }: { children: string; fg: string; fontSize?: number }) {
  return (
    <text
      x={12}
      y={12.6}
      textAnchor="middle"
      dominantBaseline="central"
      fill={fg}
      fontSize={fontSize}
      fontWeight={900}
      fontFamily="system-ui, sans-serif"
    >
      {children}
    </text>
  );
}

/** The options/menu (Start) chip: the brand's menu symbol on a white disc.
 *  Nintendo shows a "+", everyone else a hamburger (Options / Start). */
export function OptionsGlyph({ family, size = 25 }: { family: Fam; size?: number }) {
  const fg = "#0e141b";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="block">
      <circle cx={12} cy={12} r={11.5} fill="#ffffff" />
      {eff(family) === "nintendo" ? (
        <path d="M12 6.5 V17.5 M6.5 12 H17.5" fill="none" stroke={fg} strokeWidth={2.2} strokeLinecap="round" />
      ) : (
        <g fill="none" stroke={fg} strokeWidth={2} strokeLinecap="round">
          <path d="M7 9 H17" />
          <path d="M7 12 H17" />
          <path d="M7 15 H17" />
        </g>
      )}
    </svg>
  );
}

/** The guide/home button badge — a simple brand-coloured mark for the paired pad
 *  (not the trademarked logo). Falls back to the GameHub "GH" pill. */
export function GuideGlyph({ family, size = 25 }: { family: Fam; size?: number }) {
  const fam = eff(family); // null / generic default to Xbox
  if (fam === "playstation") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="block">
        <circle cx={12} cy={12} r={11.5} fill="#003791" />
        <CenterText fg="#ffffff" fontSize={9}>PS</CenterText>
      </svg>
    );
  }
  if (fam === "nintendo") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="block">
        <circle cx={12} cy={12} r={11.5} fill="#e60012" />
        {/* home / house — the Switch guide button */}
        <path d="M12 5.5 L19 12 H16.5 V18.5 H13.5 V13.5 H10.5 V18.5 H7.5 V12 H5 Z" fill="#ffffff" />
      </svg>
    );
  }
  // Xbox / X-Input (and the no-controller default).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="block">
      <circle cx={12} cy={12} r={11.5} fill="#107c10" />
      <CenterText fg="#ffffff">X</CenterText>
    </svg>
  );
}
