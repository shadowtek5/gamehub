import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { scrapeOneRom } from "@/lib/scrapeOne";
import { refreshDriftedThumbs } from "@/lib/systemThumb";
import type { ScraperItems } from "@/lib/providers/config";
import { romOpKey, startOpProgress, setOpProgress, finishOpProgress, getOpProgress } from "@/lib/opProgress";

/** Poll live progress of this game's scrape (drives the download modal). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const { id } = await params;
  return NextResponse.json(getOpProgress(romOpKey(id, "scrape")) ?? { phase: "idle" });
}

const ITEM_KEYS = [
  "description",
  "details",
  "boxart",
  "hero",
  "logo",
  "icon",
  "screenshot",
  "video",
  "manual",
  "badges",
] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  // { only: "video" | "manual" | … } fetches just that item, ignoring the
  // global toggles — grab one item for one game without scraping everything.
  let overrides: Partial<ScraperItems> | undefined;
  let onlyLabel: string | undefined;
  if (typeof body?.only === "string" && (ITEM_KEYS as readonly string[]).includes(body.only)) {
    overrides = Object.fromEntries(
      ITEM_KEYS.map((k) => [k, k === body.only])
    ) as Partial<ScraperItems>;
    onlyLabel = body.only;
  }
  // { mode: "metadata" } backfills only missing text metadata + the IGDB
  // trailer/related, downloading no artwork and never overwriting existing data.
  const metadataOnly = body?.mode === "metadata";

  // Same per-ROM work as the bulk scrape job (scrapeOneRom), so behavior can't
  // diverge between the game page and Settings/system scrapes. Progress is
  // mirrored into the op store so the cog's download modal can poll it (GET).
  const key = romOpKey(id, "scrape");
  startOpProgress(key, "items", onlyLabel);
  let outcome, slug;
  try {
    ({ outcome, slug } = await scrapeOneRom(Number(id), {
      overrides,
      onlyLabel,
      metadataOnly,
      initiatedBy: user.id,
      onProgress: (p) =>
        setOpProgress(key, {
          phase: p.phase,
          unit: "items",
          done: p.mediaDone,
          total: p.mediaTotal,
          label: p.detail,
        }),
    }));
  } catch (e) {
    finishOpProgress(key, e instanceof Error ? e.message : "Scrape failed");
    throw e;
  }
  finishOpProgress(key, outcome.ok ? undefined : outcome.error);

  // A successful scrape can change this system's covers — refresh its collage
  // images too (same effect as the bulk job, which does it at the end).
  if (outcome.ok && slug) void refreshDriftedThumbs([slug]).catch(() => {});

  return NextResponse.json(outcome, { status: outcome.ok || outcome.error ? 200 : 500 });
}
