// The single place one ROM gets scraped: run scrapeRom, then log the activity
// entry. Shared by the per-game scrape route and the bulk scrape job so the two
// can never drift. (Orchestration differs — the route is synchronous for one
// game, the job iterates many — but the per-ROM work lives here only.)

import path from "path";
import { getDb, RomRow } from "./db";
import { scrapeRom, type ScrapeOutcome, type ScrapeProgress } from "./providers/scrape";
import type { ScraperItems } from "./providers/config";
import { logActivity } from "./activity";

function mediaUrlToPath(url: string | null | undefined): string | null {
  if (!url || !url.startsWith("/api/media/")) return null;
  const rel = url.replace(/^\/api\/media\//, "").split("?")[0];
  return path.join(process.cwd(), "data", "media", ...rel.split("/"));
}

export interface ScrapeOneOpts {
  /** per-item toggles (from a single-item "fetch just this" request) */
  overrides?: Partial<ScraperItems>;
  /** force a specific provider match (from "Fix metadata match") */
  matchOverride?: { ssGameId?: number; igdbGameId?: number; lbGameId?: number };
  /** attribute the activity entry to this user; null/undefined = don't log */
  initiatedBy?: number | null;
  /** label for a single-item fetch, e.g. "video" → "Fetched video" */
  onlyLabel?: string;
  /** live per-ROM progress (phase + media items) for the bulk job's UI */
  onProgress?: (p: ScrapeProgress) => void;
  /** Metadata-only backfill: fetch text metadata + IGDB trailer/related and
   *  fill ONLY empty fields (never overwrite), downloading no artwork. */
  metadataOnly?: boolean;
}

/** Item toggles for a metadata-only scrape: text + trailer/related (which ride
 *  `details`), no media downloads. The trailer is a metadata field, not media. */
const METADATA_ONLY_ITEMS: Partial<ScraperItems> = {
  description: true,
  details: true,
  boxart: false,
  hero: false,
  logo: false,
  icon: false,
  screenshot: false,
  video: false,
  manual: false,
  badges: false,
};

/** Scrape one ROM and (optionally) log the activity entry. Returns the outcome
 *  and the ROM's platform slug (for downstream collage refresh). */
export async function scrapeOneRom(
  romId: number,
  opts: ScrapeOneOpts = {}
): Promise<{ outcome: ScrapeOutcome; slug: string | null }> {
  const overrides = opts.metadataOnly
    ? { ...METADATA_ONLY_ITEMS, ...opts.overrides }
    : opts.overrides;
  const outcome = await scrapeRom(
    romId,
    overrides,
    opts.matchOverride,
    opts.onProgress,
    opts.metadataOnly === true
  );
  const rom = getDb().prepare("SELECT * FROM roms WHERE id = ?").get(romId) as RomRow | undefined;

  if (outcome.ok && opts.initiatedBy != null) {
    logActivity({
      userId: opts.initiatedBy,
      romId,
      type: "scraped",
      summary: opts.onlyLabel
        ? `Fetched ${opts.onlyLabel}`
        : opts.metadataOnly
          ? "Metadata updated"
          : "Metadata & artwork updated",
      detail: outcome.got.length
        ? outcome.got.join(", ")
        : rom?.metadata_source
          ? `From ${rom.metadata_source}`
          : null,
      imageSourcePath:
        mediaUrlToPath(rom?.boxart_url) ??
        mediaUrlToPath(rom?.hero_url) ??
        mediaUrlToPath(rom?.screenshot_url),
    });
  }
  return { outcome, slug: rom?.platform_slug ?? null };
}
