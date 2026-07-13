import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, RomRow } from "@/lib/db";
import {
  getProviderConfig,
  screenscraperConfigured,
  igdbConfigured,
} from "@/lib/providers/config";
import { ssSearch } from "@/lib/providers/screenscraper";
import { igdbSearch } from "@/lib/providers/igdb";
import { launchboxConfigured, lbSearch } from "@/lib/providers/launchbox";

export interface MatchCandidate {
  provider: "screenscraper" | "igdb" | "launchbox";
  id: number;
  title: string;
  system?: string;
  year?: string;
}

/** Search configured metadata providers by name to pick the right game match */
export async function GET(
  req: NextRequest,
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
  const q = req.nextUrl.searchParams.get("q")?.trim() || rom.title;
  const candidates: MatchCandidate[] = [];
  const errors: string[] = [];
  const tasks: Promise<void>[] = [];

  if (screenscraperConfigured(config)) {
    tasks.push(
      ssSearch(config.screenscraper, q, rom.platform_slug).then(({ hits, error }) => {
        if (error) errors.push(error);
        for (const h of hits) candidates.push({ provider: "screenscraper", ...h });
      })
    );
  }
  if (igdbConfigured(config)) {
    tasks.push(
      igdbSearch(config.igdb, q, rom.platform_slug).then(({ hits, error }) => {
        if (error) errors.push(error);
        for (const h of hits) candidates.push({ provider: "igdb", ...h });
      })
    );
  }
  // LaunchBox is a local database — instant, no network task needed
  if (launchboxConfigured()) {
    try {
      for (const h of lbSearch(q, rom.platform_slug)) {
        candidates.push({ provider: "launchbox", ...h });
      }
    } catch (e) {
      errors.push(`LaunchBox: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (tasks.length === 0 && !launchboxConfigured()) {
    return NextResponse.json({
      candidates: [],
      error:
        "Configure ScreenScraper or IGDB, or import the LaunchBox database — matching needs a game database.",
    });
  }

  await Promise.allSettled(tasks);
  return NextResponse.json({
    candidates: candidates.slice(0, 30),
    error: candidates.length === 0 && errors.length ? errors.join("; ") : undefined,
  });
}
