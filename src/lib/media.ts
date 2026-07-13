// Detect an image's format from its magic bytes — screenshots may be WebP,
// PNG or JPEG depending on the game player, and we want the file extension,
// DB path, and served content-type to reflect the real format.

export function imageExt(buf: Buffer): "webp" | "png" | "jpg" {
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  return "png";
}

export function imageContentType(buf: Buffer): string {
  const t = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" } as const;
  return t[imageExt(buf)];
}

/** Append a width hint to a scraped-media URL so /api/media returns a right-sized
 *  WebP thumbnail instead of the full-resolution original — used for grid cards so
 *  a small capsule doesn't download a full cover. Non-media URLs pass through. */
export function mediaThumb(url: string | null | undefined, width: number): string | null {
  if (!url) return null;
  if (!url.startsWith("/api/media/")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}w=${Math.round(width)}`;
}
