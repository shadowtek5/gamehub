import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, RomRow } from "@/lib/db";
import {
  getProviderConfig,
  screenscraperConfigured,
  igdbConfigured,
  steamgriddbConfigured,
} from "@/lib/providers/config";
import { sgdbHeroList } from "@/lib/providers/steamgriddb";
import { igdbHeroList } from "@/lib/providers/igdb";
import { ssLookup } from "@/lib/providers/screenscraper";
import { platformBySlug } from "@/lib/platforms";
import { launchboxConfigured, lbLookup } from "@/lib/providers/launchbox";
import { datIdentityName } from "@/lib/providers/datdb";

export interface HeroCandidate {
  url: string;
  provider: string;
}

/** Wide-art candidates from all configured providers, for the hero picker */
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

  const config = getProviderConfig();
  const candidates: HeroCandidate[] = [];
  const errors: string[] = [];

  const tasks: Promise<void>[] = [];

  if (steamgriddbConfigured(config)) {
    tasks.push(
      sgdbHeroList(config.steamgriddb, rom.title).then(({ urls, error }) => {
        if (error) errors.push(error);
        for (const url of urls) candidates.push({ url, provider: "SteamGridDB" });
      })
    );
  }
  if (igdbConfigured(config)) {
    tasks.push(
      igdbHeroList(config.igdb, rom.title, rom.platform_slug).then(({ urls, error }) => {
        if (error) errors.push(error);
        for (const url of urls) candidates.push({ url, provider: "IGDB" });
      })
    );
  }
  if (screenscraperConfigured(config)) {
    tasks.push(
      ssLookup(config.screenscraper, rom).then(({ media, error }) => {
        if (error) errors.push(error);
        if (media?.hero) candidates.push({ url: media.hero.url, provider: "ScreenScraper" });
        if (media?.screenshot)
          candidates.push({ url: media.screenshot.url, provider: "ScreenScraper (screenshot)" });
      })
    );
  }

  await Promise.allSettled(tasks);

  // LaunchBox metadata DB (local SQLite — no API cost)
  const platform = platformBySlug(rom.platform_slug);
  if (launchboxConfigured() && platform) {
    try {
      const lb = lbLookup(datIdentityName(rom), platform);
      if (lb?.media.hero) candidates.push({ url: lb.media.hero.url, provider: "LaunchBox" });
    } catch {}
  }

  // The game's existing local screenshot is always an option
  if (rom.screenshot_url) {
    candidates.push({ url: rom.screenshot_url, provider: "Current screenshot" });
  }

  return NextResponse.json({
    candidates: candidates.slice(0, 24),
    currentHero: rom.hero_url,
    errors,
  });
}
