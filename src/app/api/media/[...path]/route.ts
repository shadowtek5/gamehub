import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { getSessionUser } from "@/lib/auth";
import { ensureThumb } from "@/lib/mediaThumbGen";
import { getDataDir } from "../../../../lib/dataDir";

/** Image types we can downscale on the fly for grid thumbnails. */
const RESIZABLE = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".pdf": "application/pdf",
};

/** Serve scraped media from data/media/<romId>/<file> */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { path: parts } = await params;
  const mediaRoot = path.join(getDataDir(), "media");
  const filePath = path.resolve(mediaRoot, ...parts);
  // Prevent path traversal
  if (!filePath.startsWith(path.resolve(mediaRoot) + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // A URL carrying a ?v= scrape stamp is content-addressed — a re-scrape/re-pick
  // mints a fresh stamp — so its bytes never change and it's safe to cache hard.
  const immutable = req.nextUrl.searchParams.has("v") || req.nextUrl.searchParams.has("w");
  const cacheControl = immutable
    ? "private, max-age=31536000, immutable"
    : "private, max-age=86400";

  // Thumbnail: ?w=<px> returns a right-sized WebP so a small grid capsule never
  // downloads full-resolution art (the big "slow to load in" cost). The derivative
  // is disk-cached next to the source and regenerated whenever the source is newer.
  const wParam = req.nextUrl.searchParams.get("w");
  if (wParam && RESIZABLE.has(ext)) {
    const w = Math.max(16, Math.min(1200, Math.round(Number(wParam)) || 0));
    if (w >= 16) {
      // Shared with the box-art optimizer so pre-generated derivatives are hits.
      const bytes = await ensureThumb(filePath, w);
      if (bytes) {
        return new NextResponse(new Uint8Array(bytes), {
          status: 200,
          headers: {
            "Content-Type": "image/webp",
            "Content-Length": String(bytes.length),
            "Cache-Control": cacheControl,
          },
        });
      }
      // Decode/resize failure falls through to serving the original bytes.
    }
  }

  const headers = new Headers({
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Content-Length": String(stat.size),
    "Cache-Control": cacheControl,
    "Accept-Ranges": "bytes",
  });

  // Range support so <video> can seek
  const range = req.headers.get("range");
  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(parseInt(match[2], 10), stat.size - 1) : stat.size - 1;
      if (start <= end && start < stat.size) {
        headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
        headers.set("Content-Length", String(end - start + 1));
        const stream = Readable.toWeb(
          fs.createReadStream(filePath, { start, end })
        ) as ReadableStream;
        return new NextResponse(stream, { status: 206, headers });
      }
    }
  }

  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, { status: 200, headers });
}
