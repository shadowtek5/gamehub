// Card box-art sizing. A system's card shape is NOT a fixed, hand-maintained
// per-system enum anymore — it's sampled at render time from the first game in
// the list that actually has box art, then applied uniformly to every card in
// that grid. Box art within one system is homogeneous (all 3DS keep-cases are
// ~1.13:1, all PS1 covers ~0.67:1, …), so one real sample matches the whole
// list, and object-cover fills each card with essentially no crop. Kept out of
// GameCard.tsx so server components (the system page) can import the types.

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
}

export type CardSizeMode = "natural" | "row" | "uniform";

/** Cover aspect (width / height) assumed before the first art has been measured,
 *  or when a list has no art at all. ~0.7 = a typical portrait front cover. */
export const DEFAULT_COVER_ASPECT = 0.7;

/** Keep a wild sample (a mis-scraped banner, a 1px sliver) from blowing out the
 *  whole grid: clamp to the range real box art actually lives in. */
export function clampCoverAspect(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return DEFAULT_COVER_ASPECT;
  return Math.min(2.2, Math.max(0.4, aspect));
}

/** Pixel footprint of one card. Uniform (mixed-system) grids keep the fixed
 *  Steam library capsule; single-system grids share one height and let the
 *  width follow the sampled art aspect, so every card is identical and the
 *  virtualizer can still pack rows. Keep in sync with GameCard's inline sizing. */
export function cardDims(aspect: number, mode: CardSizeMode, sm: boolean): { w: number; h: number } {
  // uniform = the mixed-system browse/library grid. Steam's library capsule is
  // 172x258 (measured live); small screens stay compact.
  if (mode === "uniform") return sm ? { w: 172, h: 258 } : { w: 140, h: 210 };
  const h = sm ? 212 : 198;
  return { w: Math.round(h * clampCoverAspect(aspect)), h };
}
