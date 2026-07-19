import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb, RomRow } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { saveMedia } from "@/lib/providers/mediaSave";
import { fetchImageWithProgress } from "@/lib/downloadProgress";
import { romOpKey, setOpProgress, finishOpProgress, getOpProgress } from "@/lib/opProgress";
import { getDataDir } from "../../../../../lib/dataDir";

/** Poll live progress of a logo download. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const { id } = await params;
  return NextResponse.json(getOpProgress(romOpKey(id, "logo")) ?? { phase: "idle" });
}

function mediaUrlToPath(url: string): string {
  const rel = url.replace(/^\/api\/media\//, "").split("?")[0];
  return path.join(getDataDir(), "media", ...rel.split("/"));
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Set (or clear) a game's clear-logo: downloads the chosen image locally */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { id } = await params;
  const romId = Number(id);
  const rom = getDb().prepare("SELECT * FROM roms WHERE id = ?").get(romId) as
    | RomRow
    | undefined;
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { url } = await req.json().catch(() => ({}));

  if (url === null) {
    getDb().prepare("UPDATE roms SET logo_url = NULL WHERE id = ?").run(romId);
    logActivity({ userId: user.id, romId, type: "logo", summary: "Removed logo" });
    return NextResponse.json({ ok: true, logo_url: null });
  }
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "url required (or null to clear)" }, { status: 400 });
  }

  // Local media can be referenced directly
  if (url.startsWith("/api/media/")) {
    getDb().prepare("UPDATE roms SET logo_url = ? WHERE id = ?").run(url, romId);
    logActivity({
      userId: user.id, romId, type: "logo",
      summary: "Updated logo", imageSourcePath: mediaUrlToPath(url),
    });
    return NextResponse.json({ ok: true, logo_url: url });
  }
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Only http(s) or local media URLs" }, { status: 400 });
  }

  const key = romOpKey(romId, "logo");
  try {
    const { buf, contentType: type } = await fetchImageWithProgress(url, key);
    const urlExt = url.match(/\.(png|jpe?g|webp|gif)(?:\?|$)/i)?.[1]?.toLowerCase();
    const ext = EXT_BY_TYPE[type] ?? (urlExt === "jpeg" ? "jpg" : urlExt) ?? "png";

    // Transcodes to WebP lossless (falls back to `ext` if that can't shrink it)
    setOpProgress(key, { phase: "saving" });
    const dir = path.join(getDataDir(), "media", String(romId));
    const file = await saveMedia(buf, dir, "logo", ext);
    if (!file) {
      finishOpProgress(key, "Save failed");
      return NextResponse.json({ error: "Save failed" }, { status: 500 });
    }
    const logoUrl = `/api/media/${romId}/${file}?v=${Date.now()}`;
    getDb().prepare("UPDATE roms SET logo_url = ? WHERE id = ?").run(logoUrl, romId);
    logActivity({
      userId: user.id, romId, type: "logo",
      summary: "Updated logo", imageSourcePath: path.join(dir, file),
    });
    finishOpProgress(key);
    return NextResponse.json({ ok: true, logo_url: logoUrl });
  } catch (e) {
    finishOpProgress(key, e instanceof Error ? e.message : "Download failed");
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Download failed" },
      { status: 502 }
    );
  }
}
