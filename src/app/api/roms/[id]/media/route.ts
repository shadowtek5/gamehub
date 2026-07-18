import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { MediaKey } from "@/lib/providers/config";
import { saveMedia } from "@/lib/providers/mediaSave";
import { getDataDir } from "../../../../../lib/dataDir";

const MEDIA_LABELS: Record<string, string> = {
  boxart: "box art",
  hero: "hero artwork",
  icon: "icon",
  screenshot: "screenshot",
  video: "trailer",
  theme: "title theme",
  manual: "manual",
};

const MEDIA_TYPES: Record<string, { column: string; kinds: string[] }> = {
  boxart: { column: "boxart_url", kinds: ["image"] },
  hero: { column: "hero_url", kinds: ["image"] },
  icon: { column: "icon_url", kinds: ["image"] },
  screenshot: { column: "screenshot_url", kinds: ["image"] },
  video: { column: "video_url", kinds: ["video"] },
  theme: { column: "theme_url", kinds: ["audio"] },
  manual: { column: "manual_url", kinds: ["application"] }, // PDF
};

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "video/avi": "avi",
  "video/x-msvideo": "avi",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "application/pdf": "pdf",
};

/** Upload custom media for a game, replacing the scraped version */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { id } = await params;
  const romId = Number(id);
  const rom = getDb().prepare("SELECT id FROM roms WHERE id = ?").get(romId);
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const type = String(form?.get("type") ?? "");
  const file = form?.get("file");
  const spec = MEDIA_TYPES[type];
  if (!spec) return NextResponse.json({ error: "Unknown media type" }, { status: 400 });
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > 200 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (200MB max)" }, { status: 400 });
  }

  const mime = file.type.split(";")[0].trim();
  const kind = mime.split("/")[0];
  if (!spec.kinds.includes(kind)) {
    return NextResponse.json(
      { error: `${type} must be a ${spec.kinds.join("/")} file` },
      { status: 400 }
    );
  }
  const nameExt =
    file instanceof File
      ? file.name.match(/\.(png|jpe?g|webp|gif|ico|mp4|webm|mkv|avi|mp3|ogg|wav|m4a|aac|flac|pdf)$/i)?.[1]?.toLowerCase()
      : undefined;
  const ext = EXT_BY_MIME[mime] ?? (nameExt === "jpeg" ? "jpg" : nameExt);
  if (!ext) return NextResponse.json({ error: "Unsupported file format" }, { status: 400 });

  const dir = path.join(getDataDir(), "media", String(romId));
  const buf = Buffer.from(await file.arrayBuffer());
  // Image uploads are transcoded to WebP to match scraped art; video/audio/pdf
  // are written as-is (saveMedia is a no-op transcode for non-image keys anyway,
  // but keep the raw path explicit for the non-MediaKey "theme" type).
  let savedFile: string;
  if (spec.kinds.includes("image")) {
    const f = await saveMedia(buf, dir, type as MediaKey, ext);
    if (!f) return NextResponse.json({ error: "Save failed" }, { status: 500 });
    savedFile = f;
  } else {
    await fs.promises.mkdir(dir, { recursive: true });
    savedFile = `${type}.${ext}`;
    await fs.promises.writeFile(path.join(dir, savedFile), buf);
  }

  const url = `/api/media/${romId}/${savedFile}?v=${Date.now()}`;
  getDb().prepare(`UPDATE roms SET ${spec.column} = ? WHERE id = ?`).run(url, romId);
  const label = MEDIA_LABELS[type] ?? type;
  logActivity({
    userId: user.id,
    romId,
    type,
    summary: `Uploaded ${label}`,
    // snapshot only image types (video/audio/pdf can't be shown as a thumb)
    imageSourcePath: spec.kinds.includes("image") ? path.join(dir, savedFile) : null,
  });
  return NextResponse.json({ ok: true, url });
}

/** Clear a game's media of a given type (?type=screenshot|video|…). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { id } = await params;
  const romId = Number(id);
  const type = req.nextUrl.searchParams.get("type") ?? "";
  const spec = MEDIA_TYPES[type];
  if (!spec) return NextResponse.json({ error: "Unknown media type" }, { status: 400 });

  const row = getDb()
    .prepare(`SELECT ${spec.column} AS url FROM roms WHERE id = ?`)
    .get(romId) as { url: string | null } | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Remove the on-disk file if this was an uploaded copy (/api/media/<id>/…)
  const m = row.url?.match(new RegExp(`^/api/media/${romId}/([^?]+)`));
  const localFile = m ? path.join(getDataDir(), "media", String(romId), m[1]) : null;

  const label = MEDIA_LABELS[type] ?? type;
  logActivity({
    userId: user.id,
    romId,
    type,
    summary: `Removed ${label}`,
    // snapshot what was removed (while the file still exists) for image types
    imageSourcePath: spec.kinds.includes("image") ? localFile : null,
  });

  if (localFile) {
    await fs.promises.rm(localFile, { force: true }).catch(() => {});
  }

  getDb().prepare(`UPDATE roms SET ${spec.column} = NULL WHERE id = ?`).run(romId);
  return NextResponse.json({ ok: true });
}
