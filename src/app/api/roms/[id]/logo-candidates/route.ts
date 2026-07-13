import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, RomRow } from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";
import {
  getProviderConfig,
  screenscraperConfigured,
  steamgriddbConfigured,
} from "@/lib/providers/config";
import { sgdbLogoList } from "@/lib/providers/steamgriddb";
import { ssLookup } from "@/lib/providers/screenscraper";
import { launchboxConfigured, lbLookup } from "@/lib/providers/launchbox";
import { datIdentityName } from "@/lib/providers/datdb";

export interface LogoCandidate {
  url: string;
  provider: string;
}

/** Clear-logo (transparent game-title art) candidates for the logo picker */
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
  const candidates: LogoCandidate[] = [];
  const errors: string[] = [];
  const tasks: Promise<void>[] = [];

  if (steamgriddbConfigured(config)) {
    tasks.push(
      sgdbLogoList(config.steamgriddb, rom.title).then(({ urls, error }) => {
        if (error) errors.push(error);
        for (const url of urls) candidates.push({ url, provider: "SteamGridDB" });
      })
    );
  }
  if (screenscraperConfigured(config)) {
    tasks.push(
      ssLookup(config.screenscraper, rom).then(({ media, error }) => {
        if (error) errors.push(error);
        if (media?.logo) candidates.push({ url: media.logo.url, provider: "ScreenScraper" });
      })
    );
  }

  await Promise.allSettled(tasks);

  // LaunchBox metadata DB (local SQLite — no API cost)
  const platform = platformBySlug(rom.platform_slug);
  if (launchboxConfigured() && platform) {
    try {
      const lb = lbLookup(datIdentityName(rom), platform);
      if (lb?.media.logo) candidates.push({ url: lb.media.logo.url, provider: "LaunchBox" });
    } catch {}
  }

  return NextResponse.json({
    candidates: candidates.slice(0, 24),
    currentLogo: rom.logo_url,
    errors,
  });
}
