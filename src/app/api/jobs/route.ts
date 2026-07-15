import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getScrapeJobStatus } from "@/lib/providers/scrapeJob";
import { getScanJobStatus } from "@/lib/scanJob";
import { getBoxartLocalizeStatus } from "@/lib/boxartLocalize";
import { getHashJobStatus } from "@/lib/hashJob";
import { getSystemArtJobStatus } from "@/lib/systemArtJob";
import { getThumbJobStatus } from "@/lib/systemThumb";
import { getSystemArt } from "@/lib/systemArt";
import { getHeroCollageUrl } from "@/lib/systemThumb";
import { getAllQuotaInfo } from "@/lib/providers/quota";
import { queuedViews } from "@/lib/jobQueue";
import { getSetting, isExternalNewsEnabled } from "@/lib/db";
import { getBackupStatus } from "@/lib/autoBackup";
import {
  screenscraperConfigured,
  igdbConfigured,
  mobygamesConfigured,
  steamgriddbConfigured,
  emumoviesConfigured,
} from "@/lib/providers/config";
import { launchboxConfigured } from "@/lib/providers/launchbox";

// Unified view of the background library jobs (scan + scrape) for the header
// indicator and the downloads page. Individual per-game scrapes run directly
// and are intentionally NOT part of this queue.

export interface JobView {
  kind: "scan" | "scrape" | "localize" | "hash" | "art" | "thumbs";
  label: string;
  running: boolean;
  currentSystem: string;
  done: number;
  total: number;
  systemQueue: { slug: string; total: number; done: number }[];
  startedAt: string | null;
  finishedAt: string | null;
  cancelled: boolean;
  errors: string[];
  /** the game currently being scraped (scrape only) */
  current?: string;
  /** art of the current game, for the downloads hero (scrape only) */
  currentImage?: string | null;
  /** the current system's scraped hero/logo art, for the downloads hero */
  systemHero?: string | null;
  systemLogo?: string | null;
  /** the current system's scraped icon; the header falls back to the built-in glyph */
  systemIcon?: string | null;
  /** ROMs scraped in parallel (scrape only) */
  concurrency?: number;
  /** stopped early because a provider's daily quota ran out (scrape only) */
  quotaPaused?: boolean;
  /** live sub-progress of the featured game (scrape only) */
  gameProgress?: { phase: string; mediaDone: number; mediaTotal: number; detail?: string } | null;
}

/** A recurring/automatic task that's enabled — shown under "Scheduled" so the
 *  admin can see what runs on its own (vs. the runtime queue). */
export interface AutoTask {
  key: string;
  label: string;
  detail: string;
}

function fmtIn(ms: number): string {
  if (ms <= 0) return "due now";
  const h = Math.round(ms / 3_600_000);
  if (h >= 1) return `in ~${h}h`;
  return `in ~${Math.max(1, Math.round(ms / 60_000))}m`;
}

/** Enabled recurring maintenance, derived from settings. Backup is intentionally
 *  absent — it's a manual download, not a scheduled job. */
function everyLabel(hours: number): string {
  if (hours % 24 === 0) {
    const d = hours / 24;
    return d === 1 ? "Runs daily" : `Every ${d} days`;
  }
  return `Every ${hours}h`;
}

function automaticTasks(): AutoTask[] {
  const out: AutoTask[] = [];
  if (getSetting("auto_scan") !== "off") {
    const hours = Number(getSetting("scan_interval_hours")) || 24;
    const last = getSetting("last_auto_scan");
    const next = last ? Date.parse(last) + hours * 3_600_000 : null;
    out.push({
      key: "auto-scan",
      label: "Library scan",
      detail: `${everyLabel(hours)}${next ? ` · next ${fmtIn(next - Date.now())}` : ""}`,
    });
  }
  if (getSetting("fs_watcher") === "on") {
    out.push({ key: "watcher", label: "Library file watcher", detail: "Rescans on file changes" });
  }
  if (isExternalNewsEnabled()) {
    const hours = Number(getSetting("news_interval_hours")) || 6;
    out.push({ key: "news", label: "News refresh", detail: everyLabel(hours) });
  }
  const backup = getBackupStatus();
  if (backup.enabled) {
    out.push({
      key: "backup",
      label: "Automated backup",
      detail: `${everyLabel(backup.intervalHours)}${backup.nextAt ? ` · next ${fmtIn(Date.parse(backup.nextAt) - Date.now())}` : ""}`,
    });
  }
  return out;
}

export async function GET() {
  const user = await getSessionUser();
  // The header polls this for everyone; only admins run jobs, so hide from others.
  if (!user?.isAdmin)
    return NextResponse.json({ jobs: [] as JobView[], queued: [], automatic: [], quota: [] });

  const scan = getScanJobStatus();
  const scrape = getScrapeJobStatus();
  const localize = getBoxartLocalizeStatus();
  const hash = getHashJobStatus();
  const art = getSystemArtJobStatus();
  const thumbs = getThumbJobStatus();
  // Downloads-page hero art, in priority order: the generated hero-collage,
  // then the scraped ribbon (screenmarquee), then the scraped hero (wallpaper),
  // else null → the page draws its color + glyph fallback.
  const heroFor = (slug: string): { hero: string | null; logo: string | null; icon: string | null } => {
    if (!slug) return { hero: null, logo: null, icon: null };
    const a = getSystemArt(slug);
    // icon prefers the scraped/downloaded metadata icon; null → built-in glyph
    return { hero: getHeroCollageUrl(slug) ?? a.ribbon ?? a.hero ?? null, logo: a.logo, icon: a.icon };
  };
  const scanArt = heroFor(scan.currentSystem);
  const scrapeArt = heroFor(scrape.currentSystem);
  const artArt = heroFor(art.current);
  const thumbsArt = heroFor(thumbs.current);

  const jobs: JobView[] = [
    {
      kind: "scan",
      label: "Scanning",
      running: scan.running,
      currentSystem: scan.currentSystem,
      done: scan.done,
      total: scan.total,
      systemQueue: scan.systemQueue,
      startedAt: scan.startedAt,
      finishedAt: scan.finishedAt,
      cancelled: scan.cancelled,
      errors: scan.errors,
      systemHero: scanArt.hero,
      systemLogo: scanArt.logo,
      systemIcon: scanArt.icon,
    },
    {
      kind: "scrape",
      label: "Scraping",
      running: scrape.running,
      currentSystem: scrape.currentSystem,
      done: scrape.done,
      total: scrape.total,
      systemQueue: scrape.systemQueue,
      startedAt: scrape.startedAt,
      finishedAt: scrape.finishedAt,
      cancelled: scrape.cancelled,
      errors: scrape.errors,
      current: scrape.current,
      currentImage: scrape.currentImage,
      systemHero: scrapeArt.hero,
      systemLogo: scrapeArt.logo,
      systemIcon: scrapeArt.icon,
      concurrency: scrape.concurrency,
      quotaPaused: scrape.quotaPaused,
      gameProgress: scrape.gameProgress,
    },
    {
      // Whole-library box-art optimize — no per-system breakdown, so the
      // system-specific fields stay empty and the page falls back gracefully.
      kind: "localize",
      label: "Optimizing box art",
      running: localize.running,
      currentSystem: "",
      done: localize.processed,
      total: localize.total,
      systemQueue: [],
      startedAt: localize.startedAt,
      finishedAt: localize.finishedAt,
      cancelled: localize.cancelled,
      errors: [],
      systemHero: null,
      systemLogo: null,
      systemIcon: null,
    },
    {
      kind: "hash",
      label: "Computing file hashes",
      running: hash.running,
      currentSystem: "",
      done: hash.done,
      total: hash.total,
      systemQueue: [],
      startedAt: null,
      finishedAt: hash.finishedAt,
      cancelled: hash.cancelled,
      errors: hash.errors,
      systemHero: null,
      systemLogo: null,
      systemIcon: null,
    },
    {
      kind: "art",
      label: "Re-scraping system art",
      running: art.running,
      currentSystem: art.current,
      done: art.done,
      total: art.total,
      systemQueue: [],
      startedAt: art.startedAt,
      finishedAt: art.finishedAt,
      cancelled: art.cancelled,
      errors: art.errors,
      systemHero: artArt.hero,
      systemLogo: artArt.logo,
      systemIcon: artArt.icon,
    },
    {
      kind: "thumbs",
      label: "Refreshing system images",
      running: thumbs.running,
      currentSystem: thumbs.current,
      done: thumbs.done,
      total: thumbs.total,
      systemQueue: [],
      startedAt: thumbs.startedAt,
      finishedAt: thumbs.finishedAt,
      cancelled: thumbs.cancelled,
      errors: [],
      systemHero: thumbsArt.hero,
      systemLogo: thumbsArt.logo,
      systemIcon: thumbsArt.icon,
    },
  ];

  // Tag each provider's quota with whether it's actually configured, so the UI
  // can show "not set up" instead of a bare 0 that looks broken.
  const isConfigured: Record<string, boolean> = {
    screenscraper: screenscraperConfigured(),
    igdb: igdbConfigured(),
    mobygames: mobygamesConfigured(),
    steamgriddb: steamgriddbConfigured(),
    emumovies: emumoviesConfigured(),
    launchbox: launchboxConfigured(),
    libretro: true,
  };
  const quota = getAllQuotaInfo().map((q) => ({
    ...q,
    configured: isConfigured[q.provider] ?? true,
  }));

  return NextResponse.json({ jobs, queued: queuedViews(), automatic: automaticTasks(), quota });
}
