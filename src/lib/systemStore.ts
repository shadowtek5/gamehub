import fs from "fs";
import path from "path";
import { encodeWebp } from "./providers/mediaSave";
import { MediaKey } from "./providers/config";
import { getDataDir } from "./dataDir";

/**
 * A console's art files live under data/systems/<id>/ — the folder is keyed by
 * the systems-table id (see db.ts), so the DB row and its media are linked. The
 * files are served by /api/systems/media/<id>/<file>. All other system data
 * (show flags, metadata, hiding) lives in the systems table.
 */
export const SYSTEMS_DIR = path.join(getDataDir(), "systems");

// WebP transcode policy per system-art kind, mirroring the game/scraper media
// pipeline: photographic art (hero banner, screenmarquee ribbon) is lossy;
// logos/icons stay lossless to keep crisp edges + clean alpha.
const WEBP_KEY: Record<SystemArtKind, MediaKey> = {
  hero: "hero",
  ribbon: "hero",
  logo: "logo",
  icon: "icon",
};

export type SystemArtKind = "hero" | "logo" | "icon" | "ribbon";
export const ART_KINDS: readonly SystemArtKind[] = ["hero", "logo", "icon", "ribbon"];

export function systemDir(id: number): string {
  return path.join(SYSTEMS_DIR, String(id));
}

/** Absolute path of the stored file for a kind (e.g. hero.png), or null. */
export function artFilePath(id: number, kind: SystemArtKind): string | null {
  try {
    const f = fs.readdirSync(systemDir(id)).find((n) => n.startsWith(kind + "."));
    return f ? path.join(systemDir(id), f) : null;
  } catch {
    return null;
  }
}

/** Public URL for a kind's stored file (mtime-stamped to bust caches), or null. */
export function artUrl(id: number, kind: SystemArtKind): string | null {
  const f = artFilePath(id, kind);
  if (!f) return null;
  const mtime = Math.round(fs.statSync(f).mtimeMs);
  return `/api/systems/media/${id}/${path.basename(f)}?v=${mtime}`;
}

/** Remove any stored file(s) for a kind (the extension may vary). */
export function clearArtFile(id: number, kind: SystemArtKind): void {
  try {
    for (const n of fs.readdirSync(systemDir(id)))
      if (n.startsWith(kind + ".")) fs.rmSync(path.join(systemDir(id), n));
  } catch {}
}

/**
 * Write a downloaded art buffer for a kind, replacing any prior file. Raster art
 * is transcoded to WebP (same policy as scraped/hand-picked game media) to shrink
 * storage; a source that won't decode, is already WebP, or wouldn't shrink is
 * written as-is so art is never lost or bloated.
 */
export async function writeArtFile(
  id: number,
  kind: SystemArtKind,
  buf: Buffer,
  ext: string
): Promise<void> {
  await fs.promises.mkdir(systemDir(id), { recursive: true });
  clearArtFile(id, kind);
  const webp = ext === "webp" ? null : await encodeWebp(buf, WEBP_KEY[kind]);
  if (webp) {
    await fs.promises.writeFile(path.join(systemDir(id), `${kind}.webp`), webp);
  } else {
    await fs.promises.writeFile(path.join(systemDir(id), `${kind}.${ext}`), buf);
  }
}
