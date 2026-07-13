import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { scrapeOneRom } from "@/lib/scrapeOne";
import { refreshDriftedThumbs } from "@/lib/systemThumb";

/** Re-scrape this game forcing a user-picked provider match */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const gameId = Number(body.gameId);
  const provider = String(body.provider ?? "screenscraper");
  if (!Number.isFinite(gameId) || gameId <= 0) {
    return NextResponse.json({ error: "gameId required" }, { status: 400 });
  }
  const matchOverride =
    provider === "igdb"
      ? { igdbGameId: gameId }
      : provider === "launchbox"
        ? { lbGameId: gameId }
        : { ssGameId: gameId };

  // Same per-ROM work as every other scrape (scrapeOneRom) — scrape + log — so
  // a forced-match re-scrape behaves identically and refreshes the collage.
  const { outcome, slug } = await scrapeOneRom(Number(id), {
    matchOverride,
    initiatedBy: user.id,
  });
  if (outcome.ok && slug) void refreshDriftedThumbs([slug]).catch(() => {});

  return NextResponse.json(outcome, { status: outcome.ok || outcome.error ? 200 : 500 });
}
