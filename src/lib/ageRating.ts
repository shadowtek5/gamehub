// Map a scraped age-rating string to an approximate minimum recommended age, so
// a kid profile can cap content across the many rating boards with one number.
// age_rating is stored as "AUTHORITY: value" (e.g. "ESRB: T", "PEGI: 12",
// "CERO: B", "JV: +16 ans"). Returns null when unknown/unmappable — callers
// treat null as "unrated" (shown unless the profile hides unrated).

export function ratingLevel(text: string | null | undefined): number | null {
  if (!text) return null;
  const [authRaw, valRaw] = text.includes(":") ? text.split(/:(.+)/) : ["", text];
  const auth = authRaw.trim().toUpperCase();
  const val = (valRaw ?? "").trim().toUpperCase();
  const digits = val.match(/\d+/);
  const n = digits ? parseInt(digits[0], 10) : null;

  switch (auth) {
    case "ESRB":
      if (val.startsWith("EC")) return 3;
      if (val.startsWith("E10")) return 10;
      if (val.startsWith("KA")) return 6; // Kids to Adults (old ESRB) ≈ E
      if (val.startsWith("E")) return 6;
      if (val.startsWith("T")) return 13;
      if (val.startsWith("AO")) return 18;
      if (val.startsWith("M")) return 17;
      return null; // RP (rating pending) etc.
    case "PEGI":
    case "USK":
    case "JV": // French, PEGI-aligned ("+16 ans")
    case "SELL": // French SELL, PEGI-aligned
    case "ELSPA":
    case "OFLC":
    case "ACB":
    case "GRAC": // Korea (All/12/15/18)
      return n;
    case "CERO":
      return ({ A: 0, B: 12, C: 15, D: 17, Z: 18 } as Record<string, number>)[val[0]] ?? null;
    case "VRC":
      if (val.startsWith("GA")) return 6; // General Audiences
      return n; // "13", "MA-13"
    case "AAMA":
      if (val.startsWith("GREEN")) return 0;
      if (val.startsWith("YELLOW")) return 13;
      if (val.startsWith("RED")) return 17;
      return null;
    case "SEGA":
      return null; // legacy SEGA codes ("pro_UK_01") aren't a usable age
    default:
      return n; // best-effort for any other numeric board
  }
}

/** Rating caps offered in the kid-profile UI: label → max allowed age (a game
 *  whose rating level exceeds this is hidden). null = no cap. */
export const RATING_CAPS: { value: string; label: string; max: number | null }[] = [
  { value: "none", label: "No rating limit", max: null },
  { value: "e", label: "Everyone (≈ ESRB E)", max: 6 },
  { value: "e10", label: "Everyone 10+ (≈ E10+)", max: 10 },
  { value: "t", label: "Teen (≈ ESRB T)", max: 13 },
  { value: "m", label: "Mature 17+ (≈ ESRB M)", max: 17 },
  { value: "ao", label: "Adults Only 18+ (≈ ESRB AO)", max: 18 },
];

/** UI cap value ("t") → max age (13); unknown/none → null. */
export function capToMax(value: string | null | undefined): number | null {
  return RATING_CAPS.find((c) => c.value === value)?.max ?? null;
}

/** Max age (13) → UI cap value ("t"); null → "none". */
export function maxToCap(max: number | null): string {
  if (max == null) return "none";
  // Nearest cap whose ceiling is at or above the stored max, so a custom value
  // (e.g. 16, or an 18 with no exact tier) still constrains instead of falling
  // through to "no limit". Caps are ascending, so the first match wins.
  const capped = RATING_CAPS.filter((c) => c.max != null).sort((a, b) => a.max! - b.max!);
  return capped.find((c) => c.max! >= max)?.value ?? "none";
}
