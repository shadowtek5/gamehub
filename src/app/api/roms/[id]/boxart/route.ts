import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb, RomRow } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { saveMedia } from "@/lib/providers/mediaSave";
import { safeFetch } from "@/lib/ssrfGuard";

function mediaUrlToPath(url: string): string {
  const rel = url.replace(/^\/api\/media\//, "").split("?")[0];
  return path.join(process.cwd(), "data", "media", ...rel.split("/"));
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Set (or clear) a game's box art: downloads the chosen image locally */
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
    getDb().prepare("UPDATE roms SET boxart_url = NULL WHERE id = ?").run(romId);
    logActivity({ userId: user.id, romId, type: "boxart", summary: "Removed box art" });
    return NextResponse.json({ ok: true, boxart_url: null });
  }
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "url required (or null to clear)" }, { status: 400 });
  }

  if (url.startsWith("/api/media/")) {
    getDb().prepare("UPDATE roms SET boxart_url = ? WHERE id = ?").run(url, romId);
    logActivity({
      userId: user.id, romId, type: "boxart",
      summary: "Updated box art", imageSourcePath: mediaUrlToPath(url),
    });
    return NextResponse.json({ ok: true, boxart_url: url });
  }
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Only http(s) or local media URLs" }, { status: 400 });
  }

  try {
    const res = await safeFetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) {
      return NextResponse.json({ error: `Download failed (HTTP ${res.status})` }, { status: 502 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json({ error: "Empty image" }, { status: 502 });
    }
    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    const urlExt = url.match(/\.(png|jpe?g|webp|gif)(?:\?|$)/i)?.[1]?.toLowerCase();
    const ext = EXT_BY_TYPE[type] ?? (urlExt === "jpeg" ? "jpg" : urlExt) ?? "png";

    // Transcodes to WebP (falls back to `ext` if that can't shrink it)
    const dir = path.join(process.cwd(), "data", "media", String(romId));
    const file = await saveMedia(buf, dir, "boxart", ext);
    if (!file) return NextResponse.json({ error: "Save failed" }, { status: 500 });
    const boxartUrl = `/api/media/${romId}/${file}?v=${Date.now()}`;
    getDb().prepare("UPDATE roms SET boxart_url = ? WHERE id = ?").run(boxartUrl, romId);
    logActivity({
      userId: user.id, romId, type: "boxart",
      summary: "Updated box art", imageSourcePath: path.join(dir, file),
    });
    return NextResponse.json({ ok: true, boxart_url: boxartUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Download failed" },
      { status: 502 }
    );
  }
}
