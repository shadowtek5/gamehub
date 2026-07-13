import { Platform } from "./platforms";

// Client-safe (no Node imports) so the ROM editor can build preview URLs.

/** libretro-thumbnails replaces characters that are illegal in filenames with '_' */
export function libretroThumbName(name: string): string {
  return name.replace(/[&*/:`<>?\\|"]/g, "_");
}

function url(platform: Platform, baseName: string): string {
  return `https://thumbnails.libretro.com/${encodeURIComponent(
    platform.libretroName
  )}/Named_Boxarts/${encodeURIComponent(libretroThumbName(baseName))}.png`;
}

/**
 * Box art from thumbnails.libretro.com — free, no API key.
 * Works best with No-Intro-named ROMs; the client falls back to a
 * generated placeholder when the image 404s.
 */
export function libretroBoxartUrl(platform: Platform, filename: string): string {
  return url(platform, filename.replace(/\.[^.]+$/, ""));
}

/** Alternate lookup using the cleaned title (helps when the filename has no region tags) */
export function libretroBoxartUrlFromTitle(platform: Platform, title: string): string {
  return url(platform, title);
}
