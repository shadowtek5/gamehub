// Libretro Thumbnails — completely free, no account or key.
// https://thumbnails.libretro.com/<System>/<Type>/<No-Intro name>.png
// Provides box art and in-game screenshots (no metadata, no videos).

import { Platform } from "../platforms";
import { libretroThumbName } from "../boxart";

const BASE = "https://thumbnails.libretro.com";

type ThumbType = "Named_Boxarts" | "Named_Snaps" | "Named_Titles";

function thumbUrl(platform: Platform, type: ThumbType, name: string): string {
  return `${BASE}/${encodeURIComponent(platform.libretroName)}/${type}/${encodeURIComponent(
    libretroThumbName(name)
  )}.png`;
}

/**
 * Candidate URLs to try in order (filename match first — most reliable for
 * No-Intro sets — then the cleaned title).
 */
export function libretroCandidates(
  platform: Platform,
  filename: string,
  title: string
): { boxart: string[]; screenshot: string[] } {
  const base = filename.replace(/\.[^.]+$/, "");
  const names = base.toLowerCase() === title.toLowerCase() ? [base] : [base, title];
  return {
    boxart: names.map((n) => thumbUrl(platform, "Named_Boxarts", n)),
    // Prefer gameplay snaps; fall back to title screens
    screenshot: [
      ...names.map((n) => thumbUrl(platform, "Named_Snaps", n)),
      ...names.map((n) => thumbUrl(platform, "Named_Titles", n)),
    ],
  };
}
