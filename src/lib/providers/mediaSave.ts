// Shared image-download + WebP transcode used by the scraper and the manual
// art pickers, so scraped and hand-picked media are stored identically.
//
// Raster art is re-encoded to WebP on download to shrink storage. Photographic
// art (box renders, screenshots, hero banners) uses lossy q82 — visually lossless
// on a TV at a fraction of PNG size; logos/icons/badges use lossless WebP to keep
// crisp edges and clean alpha. Video and manuals are deliberately never touched.

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { MediaKey } from "./config";
import { ssFetch } from "./ssFetch";

const WEBP_ENCODE: Partial<Record<MediaKey, "lossy" | "lossless">> = {
  boxart: "lossy",
  hero: "lossy",
  screenshot: "lossy",
  logo: "lossless",
  icon: "lossless",
  publisher_logo: "lossless",
  developer_logo: "lossless",
  rating_logo: "lossless",
};

/**
 * Transcode a raster image buffer to WebP using this key's policy (lossy q82 for
 * photographic art, lossless for logos/icons/badges). Returns the WebP bytes, or
 * null if the key isn't a raster type, the source won't decode, or WebP wouldn't
 * shrink it. Shared by saveMedia and the EmuMovies reference library.
 */
export async function encodeWebp(buf: Buffer, key: MediaKey): Promise<Buffer | null> {
  const mode = WEBP_ENCODE[key];
  if (!mode) return null;
  try {
    const webp = await sharp(buf)
      .webp(mode === "lossless" ? { lossless: true } : { quality: 82 })
      .toBuffer();
    return webp.length > 0 && webp.length < buf.length ? webp : null;
  } catch {
    return null;
  }
}

export async function fetchBuf(url: string): Promise<Buffer | null> {
  try {
    const res = await ssFetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Write a media buffer for `key` into `dir`, transcoding raster art to WebP
 * (see WEBP_ENCODE). Returns the file name actually written — its extension may
 * differ from `srcFormat` when transcoded — or null on failure. A transcode
 * error (or a source that only gets bigger as WebP) falls back to the original
 * bytes so media is never lost or bloated.
 */
export async function saveMedia(
  buf: Buffer,
  dir: string,
  key: MediaKey,
  srcFormat: string
): Promise<string | null> {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    const webp = await encodeWebp(buf, key);
    if (webp) {
      const file = `${key}.webp`;
      await fs.promises.writeFile(path.join(dir, file), webp);
      return file;
    }
    // Undecodable/unsupported source, or WebP wouldn't shrink it — keep original.
    const file = `${key}.${srcFormat}`;
    await fs.promises.writeFile(path.join(dir, file), buf);
    return file;
  } catch {
    return null;
  }
}
