import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, RomRow } from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";
import { libretroCandidates } from "@/lib/providers/libretro";
import { libretroBoxartUrlFromTitle } from "@/lib/boxart";
import { datIdentityName } from "@/lib/providers/datdb";
import {
  getProviderConfig,
  screenscraperConfigured,
  igdbConfigured,
  mobygamesConfigured,
  steamgriddbConfigured,
} from "@/lib/providers/config";
import { ssLookup } from "@/lib/providers/screenscraper";
import { igdbLookup } from "@/lib/providers/igdb";
import { mobyLookup } from "@/lib/providers/mobygames";
import { sgdbLookup } from "@/lib/providers/steamgriddb";
import { launchboxConfigured, lbLookup } from "@/lib/providers/launchbox";

/** Does a guessed libretro thumbnail actually exist? (Most don't — the URL is
 *  built from the ROM name, which rarely matches libretro's exact No-Intro name.)
 *  A HEAD is enough and avoids downloading the image just to check. */
async function libretroExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "GameHub/0.1 (box-art picker)" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Box-art candidates from all configured providers, for the box art picker */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { id } = await params;
  const rom = getDb().prepare("SELECT * FROM roms WHERE id = ?").get(Number(id)) as
    | RomRow
    | undefined;
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const platform = platformBySlug(rom.platform_slug);

  const config = getProviderConfig();
  const candidates: { url: string; provider: string }[] = [];
  const errors: string[] = [];
  const tasks: Promise<void>[] = [];

  if (screenscraperConfigured(config)) {
    tasks.push(
      ssLookup(config.screenscraper, rom).then(({ media, error }) => {
        if (error) errors.push(error);
        if (media?.boxart) candidates.push({ url: media.boxart.url, provider: "ScreenScraper" });
      })
    );
  }
  if (igdbConfigured(config)) {
    tasks.push(
      igdbLookup(config.igdb, rom.title, rom.platform_slug).then(({ result, error }) => {
        if (error) errors.push(error);
        if (result?.media.boxart) candidates.push({ url: result.media.boxart.url, provider: "IGDB" });
      })
    );
  }
  if (mobygamesConfigured(config)) {
    tasks.push(
      mobyLookup(config.mobygames, rom.title, rom.platform_slug).then(({ result, error }) => {
        if (error) errors.push(error);
        if (result?.media.boxart) candidates.push({ url: result.media.boxart.url, provider: "MobyGames" });
      })
    );
  }
  if (steamgriddbConfigured(config)) {
    tasks.push(
      sgdbLookup(config.steamgriddb, rom.title).then(({ result, error }) => {
        if (error) errors.push(error);
        if (result?.media.boxart) candidates.push({ url: result.media.boxart.url, provider: "SteamGridDB" });
      })
    );
  }

  await Promise.allSettled(tasks);

  // Canonical No-Intro/Redump name (by hash, else title) — used so LaunchBox +
  // libretro identify the game the same way the scraper does.
  const identity = datIdentityName(rom);

  // LaunchBox metadata DB (local SQLite — no API cost)
  if (launchboxConfigured() && platform) {
    try {
      const lb = lbLookup(identity, platform);
      if (lb?.media.boxart) candidates.push({ url: lb.media.boxart.url, provider: "LaunchBox" });
    } catch {}
  }

  // libretro-thumbnails — free, no key. libretro names its thumbnails by the
  // exact No-Intro/Redump name, so the DAT identity is the most reliable
  // filename; fall back to the ROM filename + title guesses. These are just
  // guesses, and most don't exist — VERIFY each one so the picker only ever
  // shows real covers instead of silently-broken (404) thumbnails.
  if (platform) {
    const lrUrls = [...new Set([
      ...(identity !== rom.title ? [libretroBoxartUrlFromTitle(platform, identity)] : []),
      ...libretroCandidates(platform, rom.filename, rom.title).boxart,
    ])].slice(0, 4);
    const checked = await Promise.all(
      lrUrls.map(async (url) => ({ url, ok: await libretroExists(url) }))
    );
    for (const { url, ok } of checked) {
      if (ok && !candidates.some((c) => c.url === url)) {
        candidates.push({ url, provider: "libretro-thumbnails" });
      }
    }
  }
  if (rom.boxart_url) {
    candidates.push({ url: rom.boxart_url, provider: "Current box art" });
  }

  return NextResponse.json({ candidates: candidates.slice(0, 24), errors });
}
