// Shared box-art / media thumbnail generation. The /api/media route makes these
// on demand (?w=<px>) and caches them on disk next to the source; the box-art
// optimizer pre-generates the same files so first views never pay the resize.
// Both MUST agree on the path + encode, so it lives here.

import fs from "fs";
import sharp from "sharp";

/** Widths the grids actually request (desktop/TV cover = 400, mobile cover =
 *  300). Pre-generating these makes a freshly-localized library paint instantly. */
export const GRID_THUMB_WIDTHS = [400, 300] as const;

/** Disk path of the cached derivative — mirrors the /api/media route's naming so
 *  a pre-generated file is a cache hit there (and vice-versa). */
export function thumbPath(sourcePath: string, w: number): string {
  return `${sourcePath}.w${w}.webp`;
}

/**
 * Ensure a width-`w` WebP thumbnail exists (and is newer than the source) for a
 * local image. Returns the bytes on success, or null if the source can't be
 * read/decoded. A fresh cached derivative is returned without re-encoding.
 */
export async function ensureThumb(sourcePath: string, w: number): Promise<Buffer | null> {
  try {
    const stat = await fs.promises.stat(sourcePath);
    const tp = thumbPath(sourcePath, w);
    try {
      const ts = await fs.promises.stat(tp);
      if (ts.mtimeMs >= stat.mtimeMs) return await fs.promises.readFile(tp);
    } catch {
      // no derivative yet — fall through and build it
    }
    const bytes = await sharp(sourcePath)
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    await fs.promises.writeFile(tp, bytes).catch(() => {});
    return bytes;
  } catch {
    return null;
  }
}
