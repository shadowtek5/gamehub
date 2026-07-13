import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getProviderConfig,
  screenscraperConfigured,
  emumoviesConfigured,
  igdbConfigured,
  mobygamesConfigured,
  steamgriddbConfigured,
  thegamesdbConfigured,
} from "@/lib/providers/config";
import { ssTest } from "@/lib/providers/screenscraper";
import { emTest } from "@/lib/providers/emumovies";
import { igdbTest } from "@/lib/providers/igdb";
import { mobyTest } from "@/lib/providers/mobygames";
import { tgdbTest } from "@/lib/providers/thegamesdb";
import { sgdbTest } from "@/lib/providers/steamgriddb";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { provider } = await req.json().catch(() => ({}));
  const config = getProviderConfig();

  if (provider === "screenscraper") {
    if (!config.screenscraper.ssid || !config.screenscraper.sspassword) {
      return NextResponse.json({ ok: false, message: "Enter your username and password first" });
    }
    if (!screenscraperConfigured(config)) {
      return NextResponse.json({
        ok: false,
        message:
          "This build has no app credentials embedded — run scripts/embed-ss-dev.mjs (or set SCREENSCRAPER_DEVID / SCREENSCRAPER_DEVPASSWORD)",
      });
    }
    return NextResponse.json(await ssTest(config.screenscraper));
  }
  if (provider === "emumovies") {
    if (!emumoviesConfigured(config)) {
      return NextResponse.json({ ok: false, message: "Enter your username and password first" });
    }
    return NextResponse.json(await emTest(config.emumovies));
  }
  if (provider === "igdb") {
    if (!igdbConfigured(config)) {
      return NextResponse.json({ ok: false, message: "Enter your Client ID and Client Secret first" });
    }
    return NextResponse.json(await igdbTest(config.igdb));
  }
  if (provider === "mobygames") {
    if (!mobygamesConfigured(config)) {
      return NextResponse.json({ ok: false, message: "Enter your API key first" });
    }
    return NextResponse.json(await mobyTest(config.mobygames));
  }
  if (provider === "steamgriddb") {
    if (!steamgriddbConfigured(config)) {
      return NextResponse.json({ ok: false, message: "Enter your API key first" });
    }
    return NextResponse.json(await sgdbTest(config.steamgriddb));
  }
  if (provider === "thegamesdb") {
    if (!thegamesdbConfigured(config)) {
      return NextResponse.json({ ok: false, message: "Enter your API key first" });
    }
    return NextResponse.json(await tgdbTest(config.thegamesdb));
  }
  return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
}
