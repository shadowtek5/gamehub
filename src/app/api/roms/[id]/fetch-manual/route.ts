import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb, RomRow } from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";
import { getProviderConfig, emumoviesConfigured } from "@/lib/providers/config";
import { emSharedClient, emLocate, emDownload } from "@/lib/providers/emumovies";
import { scrapeRom } from "@/lib/providers/scrape";
import { setVideoProgress, getVideoProgress } from "@/lib/providers/videoProgress";
import { getDataDir } from "../../../../../lib/dataDir";

/** Poll live progress of a manual fetch */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const { id } = await params;
  return NextResponse.json(getVideoProgress(Number(id)) ?? { phase: "idle" });
}

/**
 * Fetch just this game's PDF manual (ignores the global manual toggle),
 * reporting download progress via the GET endpoint — the manual counterpart
 * of fetch-video.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { id } = await params;
  const romId = Number(id);
  const db = getDb();
  const rom = db.prepare("SELECT * FROM roms WHERE id = ?").get(romId) as RomRow | undefined;
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const platform = platformBySlug(rom.platform_slug);
  if (!platform) return NextResponse.json({ error: "Unknown system" }, { status: 400 });

  const config = getProviderConfig();
  let emError: string | undefined;

  try {
    // EmuMovies path: known file size -> real progress
    if (emumoviesConfigured(config)) {
      setVideoProgress(romId, { phase: "searching", bytes: 0, total: 0 });
      try {
        const client = await emSharedClient(config.emumovies);
        const located = await emLocate(client, platform, rom.title, rom.filename);
        if (located.manual) {
          const total = located.manual.size ?? 0;
          setVideoProgress(romId, { phase: "downloading", bytes: 0, total });
          client.trackProgress((info) =>
            setVideoProgress(romId, { phase: "downloading", bytes: info.bytes, total })
          );
          const file = `manual.${located.manual.ext}`;
          try {
            await emDownload(
              client,
              located.manual.remote,
              path.join(getDataDir(), "media", String(romId), file)
            );
          } finally {
            client.trackProgress(); // stop tracking
          }
          const url = `/api/media/${romId}/${file}?v=${Date.now()}`;
          db.prepare("UPDATE roms SET manual_url = ? WHERE id = ?").run(url, romId);
          return NextResponse.json({ ok: true, url, source: "emumovies" });
        }
        emError = located.error ?? `No EmuMovies manual for "${rom.title}"`;
      } catch (e) {
        emError = `EmuMovies: ${e instanceof Error ? e.message : e}`;
      }
    }

    // Fallback: any other provider that has manuals (e.g. ScreenScraper)
    setVideoProgress(romId, { phase: "downloading", bytes: 0, total: 0 });
    const outcome = await scrapeRom(romId, {
      description: false,
      details: false,
      boxart: false,
      hero: false,
      icon: false,
      screenshot: false,
      video: false,
      manual: true,
    });
    if (outcome.ok && outcome.got.includes("manual")) {
      return NextResponse.json({ ok: true, source: outcome.sources.join("+") });
    }
    return NextResponse.json({
      ok: false,
      error: outcome.error ?? emError ?? "No manual found",
    });
  } finally {
    setVideoProgress(romId, null);
  }
}
