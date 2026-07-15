// Prebuilt cheat catalog — a curated starter set of well-documented Game Genie
// codes, keyed by platform family + normalised game title. It's intentionally
// small and high-confidence rather than a comprehensive database; custom codes
// (typed by the user) are the primary path, and this list is trivial to grow.
//
// Codes are passed verbatim to the libretro core via EmulatorJS's cheat API,
// which accepts raw Game Genie / Pro Action Replay codes for these systems.

import { dbCheats } from "./db";

export interface CatalogCheat {
  name: string;
  code: string;
}

interface CatalogEntry {
  // Platform families this entry applies to (matches the start of the slug).
  family: "nes" | "snes" | "gb" | "gbc" | "gba" | "genesis" | "segaMD";
  // Normalised title (see normTitle) the game must match.
  title: string;
  cheats: CatalogCheat[];
}

// Collapse a ROM title to a comparable key: lowercase, drop bracketed tags
// (region/version), drop leading/trailing articles (the/a/an) so sorted-style
// "Legend of Zelda, The" matches "The Legend of Zelda", then strip to
// alphanumerics. MUST stay in sync with normTitle() in scripts/import-cheats.mjs.
export function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\ba\b/g, " ")
    .replace(/\ban\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

const CATALOG: CatalogEntry[] = [
  {
    family: "nes",
    title: normTitle("Super Mario Bros"),
    cheats: [
      { name: "Infinite lives", code: "SXIOPO" },
      { name: "Start on world 8", code: "AWAPZG" },
    ],
  },
  {
    family: "nes",
    title: normTitle("Contra"),
    cheats: [
      { name: "Infinite lives (P1)", code: "SLXPAPSE" },
      { name: "Infinite lives (P2)", code: "SLXPLPSE" },
    ],
  },
];

/**
 * Prebuilt cheats for a game. Prefers the imported cheat database
 * (data/cheats.db, hundreds of thousands of entries); falls back to the small
 * built-in seed list when the DB is absent or has nothing for this game.
 */
export function prebuiltCheats(platformSlug: string, title: string): CatalogCheat[] {
  const key = normTitle(title);
  const fromDb = dbCheats(platformSlug, key);
  if (fromDb.length) return fromDb;
  const entry = CATALOG.find((e) => platformSlug.startsWith(e.family) && e.title === key);
  return entry ? entry.cheats : [];
}
