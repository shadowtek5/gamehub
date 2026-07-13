import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, RomRow } from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";
import { parseYouTubeId, themeSearchQuery, ytSearchVideoId } from "@/lib/themeMusic";

/**
 * Resolve this game's theme music: an uploaded file wins, otherwise the
 * cached YouTube match (searching and caching it on first request).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const rom = db.prepare("SELECT * FROM roms WHERE id = ?").get(Number(id)) as
    | RomRow
    | undefined;
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (rom.theme_url) return NextResponse.json({ type: "file", url: rom.theme_url });

  let videoId = rom.theme_yt_id;
  if (videoId === null) {
    const platform = platformBySlug(rom.platform_slug);
    videoId = await ytSearchVideoId(
      themeSearchQuery(rom.title, platform?.name ?? rom.platform_slug)
    );
    // Cache the answer either way ('' = searched, nothing found) so the
    // game page doesn't hit YouTube on every visit
    db.prepare("UPDATE roms SET theme_yt_id = ? WHERE id = ?").run(videoId ?? "", rom.id);
  }
  if (videoId) return NextResponse.json({ type: "youtube", videoId });
  return NextResponse.json({ type: "none" });
}

/**
 * Pin or clear the YouTube match (Properties → Media Uploads):
 *   { youtube: "url or id" }  set a specific video
 *   { youtube: null }         forget the match; auto-search again next visit
 *   { clearFile: true }       drop the uploaded audio file reference
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { id } = await params;
  const db = getDb();
  const rom = db.prepare("SELECT id FROM roms WHERE id = ?").get(Number(id));
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (body.clearFile) {
    db.prepare("UPDATE roms SET theme_url = NULL WHERE id = ?").run(Number(id));
    return NextResponse.json({ ok: true });
  }

  if ("youtube" in body) {
    if (body.youtube === null || body.youtube === "") {
      db.prepare("UPDATE roms SET theme_yt_id = NULL WHERE id = ?").run(Number(id));
      return NextResponse.json({ ok: true, videoId: null });
    }
    const videoId = parseYouTubeId(String(body.youtube));
    if (!videoId) {
      return NextResponse.json({ error: "Not a YouTube URL or video id" }, { status: 400 });
    }
    db.prepare("UPDATE roms SET theme_yt_id = ? WHERE id = ?").run(videoId, Number(id));
    return NextResponse.json({ ok: true, videoId });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}
