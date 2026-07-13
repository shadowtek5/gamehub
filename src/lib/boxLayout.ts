// Pure box-art layout helpers shared by GameCard (a client component) and
// server components (e.g. the system page computes the effective layout for
// row packing). Kept out of GameCard.tsx so it stays importable from the
// server — a "use client" module's functions can't be called from the server.

/** The minimum a card needs — grids pass slim rows to keep payloads small */
export interface CardRom {
  id: number;
  title: string;
  boxart_url: string | null;
  /** short preview clip, played muted on hover (optional — grids may omit it) */
  video_url?: string | null;
  platform_slug: string;
  variant: string | null;
  /** Comma-joined codes ("Ja" / "En,Fr,De") */
  language?: string | null;
  favorite: number;
  playtime_seconds: number;
  /** effective box-art shape from the systems table (else built-in default) */
  box_layout?: string | null;
}

export type BoxLayout = "wide" | "square" | "portrait";

// Built-in default box shape per system — the fallback when the DB has no
// measured/overridden layout yet. Verified by measuring scraped box art (W/H):
// >1.15 wide, 0.85–1.15 square, else portrait.
//  • wide   — SNES/N64 landscape boxes (~1.4)
//  • square — Game Boy family + DS/3DS (~0.9–1.1)
// Everything else (incl. PSX/CD front covers ~0.67) is portrait.
const WIDE_BOXART = new Set(["snes", "n64"]);
const SQUARE_BOXART = new Set(["gb", "gbc", "gba", "vb", "nds", "3ds"]);

export function boxLayoutForSlug(slug: string): BoxLayout {
  return WIDE_BOXART.has(slug) ? "wide" : SQUARE_BOXART.has(slug) ? "square" : "portrait";
}

/** Coerce a stored/effective layout string to a BoxLayout, falling back to the
 *  built-in default for the slug. */
export function resolveBoxLayout(slug: string, layout?: string | null): BoxLayout {
  return layout === "wide" || layout === "square" || layout === "portrait"
    ? layout
    : boxLayoutForSlug(slug);
}

export type CardSizeMode = "natural" | "row" | "uniform";

/** Numeric footprint (px) matching cardSize's classes — the virtualized grid
 *  packs rows from these. `sm` = viewport ≥ 640px. Keep in sync with cardSize. */
export function cardFootprint(
  layout: BoxLayout,
  mode: CardSizeMode,
  sm: boolean
): { w: number; h: number } {
  // uniform = the mixed-system browse/library grid. Steam's library capsule
  // is 172x258 (measured live); small screens stay compact.
  if (mode === "uniform") return sm ? { w: 172, h: 258 } : { w: 140, h: 210 };
  if (layout === "wide") return sm ? { w: 218, h: 156 } : { w: 204, h: 146 };
  if (layout === "square") return sm ? { w: 180, h: 180 } : { w: 168, h: 168 };
  return sm ? { w: 150, h: 212 } : { w: 140, h: 198 };
}

export function cardSize(layout: BoxLayout, mode: CardSizeMode): { card: string; cover: string } {
  if (mode === "uniform") {
    // Mixed-system wrap grids: one footprint for every card; art fills it
    return { card: "w-[140px] sm:w-[172px]", cover: "h-[210px] sm:h-[258px]" };
  }
  if (mode === "row") {
    // Horizontal shelves mixing systems: one shared height, width follows
    // the box shape — the row stays perfectly aligned
    if (layout === "wide") return { card: "w-[277px] sm:w-[297px]", cover: "h-[198px] sm:h-[212px]" };
    if (layout === "square") return { card: "w-[198px] sm:w-[212px]", cover: "h-[198px] sm:h-[212px]" };
    return { card: "w-[140px] sm:w-[150px]", cover: "h-[198px] sm:h-[212px]" };
  }
  if (layout === "wide") return { card: "w-[204px] sm:w-[218px]", cover: "h-[146px] sm:h-[156px]" };
  if (layout === "square") return { card: "w-[168px] sm:w-[180px]", cover: "h-[168px] sm:h-[180px]" };
  return { card: "w-[140px] sm:w-[150px]", cover: "h-[198px] sm:h-[212px]" };
}
