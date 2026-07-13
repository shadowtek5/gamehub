// Library management reports: usage analytics + data-quality checks to help an
// admin keep the collection healthy. Each report is INDEPENDENT and computed on
// demand — the picker runs only the one you choose (the DAT hash-verify pass is
// the slow one; everything else is a couple of indexed queries). Detail lists
// are capped; the counts are always the true totals.

import { getDb } from "./db";
import { platformBySlug } from "./platforms";
import { datConfigured, datStatus, datVerify } from "./providers/datdb";

/** Max rows kept in any drill-down list (counts are still the full totals). */
const SAMPLE_CAP = 200;

export interface RomRef {
  id: number;
  title: string;
  platform_slug: string;
  filename: string;
  note?: string;
}

export interface ReportSystemRow {
  slug: string;
  name: string;
  games: number;
  scraped: number;
  hashed: number;
  bytes: number;
}

function count(sql: string, ...params: unknown[]): number {
  return (getDb().prepare(sql).get(...params) as { c: number }).c;
}

const nameOf = (slug: string) => platformBySlug(slug)?.name ?? slug;

/** Per-system rows, shared by the overview and scrape-gap reports. */
function systemsBreakdown(): ReportSystemRow[] {
  return (
    getDb()
      .prepare(
        `SELECT platform_slug AS slug,
                COUNT(*) AS games,
                COUNT(CASE WHEN scraped_at IS NOT NULL THEN 1 END) AS scraped,
                COUNT(CASE WHEN md5 IS NOT NULL AND md5 <> '' THEN 1 END) AS hashed,
                COALESCE(SUM(size_bytes),0) AS bytes
         FROM roms WHERE missing = 0
         GROUP BY platform_slug ORDER BY games DESC`
      )
      .all() as Omit<ReportSystemRow, "name">[]
  ).map((s) => ({ ...s, name: nameOf(s.slug) }));
}

// ---------------------------------------------------------------- reports

export interface OverviewReport {
  overview: {
    games: number;
    missing: number;
    scraped: number;
    unscraped: number;
    hashed: number;
    unhashed: number;
    totalBytes: number;
    users: number;
    activeUsers: number;
    collections: number;
    saveStates: number;
    totalPlaytimeSeconds: number;
    playedGames: number;
    datLoaded: boolean;
    datEntries: number;
  };
  systems: ReportSystemRow[];
}

function overviewReport(): OverviewReport {
  const db = getDb();
  const games = count("SELECT COUNT(*) c FROM roms WHERE missing = 0");
  const scraped = count("SELECT COUNT(*) c FROM roms WHERE missing = 0 AND scraped_at IS NOT NULL");
  const hashed = count(
    "SELECT COUNT(*) c FROM roms WHERE missing = 0 AND md5 IS NOT NULL AND md5 <> ''"
  );
  return {
    overview: {
      games,
      missing: count("SELECT COUNT(*) c FROM roms WHERE missing = 1"),
      scraped,
      unscraped: games - scraped,
      hashed,
      unhashed: count("SELECT COUNT(*) c FROM roms WHERE missing = 0 AND (md5 IS NULL OR md5 = '')"),
      totalBytes: (
        db.prepare("SELECT COALESCE(SUM(size_bytes),0) c FROM roms WHERE missing = 0").get() as {
          c: number;
        }
      ).c,
      users: count("SELECT COUNT(*) c FROM users"),
      activeUsers: count(
        "SELECT COUNT(DISTINCT user_id) c FROM user_roms WHERE last_played_at >= datetime('now','-30 days')"
      ),
      collections: count("SELECT COUNT(*) c FROM collections"),
      saveStates: count("SELECT COUNT(*) c FROM save_states"),
      totalPlaytimeSeconds: (
        db.prepare("SELECT COALESCE(SUM(playtime_seconds),0) c FROM user_roms").get() as {
          c: number;
        }
      ).c,
      playedGames: count(
        "SELECT COUNT(DISTINCT rom_id) c FROM user_roms WHERE last_played_at IS NOT NULL"
      ),
      datLoaded: datConfigured(),
      datEntries: datStatus().entries ?? 0,
    },
    systems: systemsBreakdown(),
  };
}

export interface MostPlayedReport {
  mostPlayed: { id: number; title: string; platform_slug: string; playtimeSeconds: number }[];
}

function mostPlayedReport(): MostPlayedReport {
  return {
    mostPlayed: getDb()
      .prepare(
        `SELECT r.id AS id, r.title AS title, r.platform_slug AS platform_slug,
                SUM(ur.playtime_seconds) AS playtimeSeconds
         FROM user_roms ur JOIN roms r ON r.id = ur.rom_id
         WHERE ur.playtime_seconds > 0
         GROUP BY ur.rom_id ORDER BY playtimeSeconds DESC LIMIT 25`
      )
      .all() as MostPlayedReport["mostPlayed"],
  };
}

export interface MissingReport {
  missingFiles: { count: number; items: RomRef[] };
}

function missingReport(): MissingReport {
  return {
    missingFiles: {
      count: count("SELECT COUNT(*) c FROM roms WHERE missing = 1"),
      items: getDb()
        .prepare(
          `SELECT id, title, platform_slug, filename FROM roms
           WHERE missing = 1 ORDER BY platform_slug, sort_title LIMIT ?`
        )
        .all(SAMPLE_CAP) as RomRef[],
    },
  };
}

export interface DuplicatesReport {
  duplicates: { count: number; groups: { title: string; items: RomRef[] }[] };
}

function duplicatesReport(): DuplicatesReport {
  const db = getDb();
  const dupHashes = db
    .prepare(
      `SELECT md5, COUNT(*) c FROM roms
       WHERE missing = 0 AND md5 IS NOT NULL AND md5 <> ''
       GROUP BY md5 HAVING c > 1 ORDER BY c DESC`
    )
    .all() as { md5: string; c: number }[];
  const groups = dupHashes.slice(0, SAMPLE_CAP).map((d) => {
    const items = db
      .prepare(
        `SELECT id, title, platform_slug, filename FROM roms
         WHERE missing = 0 AND md5 = ? ORDER BY platform_slug, filename`
      )
      .all(d.md5) as RomRef[];
    return { title: items[0]?.title ?? "(unknown)", items };
  });
  return { duplicates: { count: dupHashes.length, groups } };
}

export interface HashHealthReport {
  hashHealth: {
    datLoaded: boolean;
    coveredSystems: number;
    verified: number;
    mismatch: { count: number; items: RomRef[] };
    unknown: number;
    unhashed: { count: number; items: RomRef[] };
  };
}

function hashHealthReport(): HashHealthReport {
  const db = getDb();
  const unhashedCount = count(
    "SELECT COUNT(*) c FROM roms WHERE missing = 0 AND (md5 IS NULL OR md5 = '')"
  );
  const unhashedItems = db
    .prepare(
      `SELECT id, title, platform_slug, filename FROM roms
       WHERE missing = 0 AND (md5 IS NULL OR md5 = '')
       ORDER BY platform_slug, sort_title LIMIT ?`
    )
    .all(SAMPLE_CAP) as RomRef[];

  let verified = 0;
  let unknown = 0;
  let coveredSystems = 0;
  const mismatchItems: RomRef[] = [];
  let mismatchCount = 0;
  if (datConfigured()) {
    coveredSystems = count("SELECT COUNT(DISTINCT platform_slug) c FROM roms WHERE missing = 0");
    const hashedRoms = db
      .prepare(
        `SELECT id, title, platform_slug, filename, crc32, md5, sha1 FROM roms
         WHERE missing = 0 AND md5 IS NOT NULL AND md5 <> ''`
      )
      .all() as (RomRef & { crc32: string | null; md5: string | null; sha1: string | null })[];
    for (const r of hashedRoms) {
      const v = datVerify(r);
      if (v.status === "verified") verified++;
      else if (v.status === "mismatch") {
        mismatchCount++;
        if (mismatchItems.length < SAMPLE_CAP) {
          mismatchItems.push({
            id: r.id,
            title: r.title,
            platform_slug: r.platform_slug,
            filename: r.filename,
            note: v.canonicalName ? `DAT: ${v.canonicalName}` : undefined,
          });
        }
      } else unknown++;
    }
  }
  return {
    hashHealth: {
      datLoaded: datConfigured(),
      coveredSystems,
      verified,
      mismatch: { count: mismatchCount, items: mismatchItems },
      unknown,
      unhashed: { count: unhashedCount, items: unhashedItems },
    },
  };
}

export interface ScrapeGapsReport {
  scrapeGaps: { count: number; bySystem: { slug: string; name: string; unscraped: number }[] };
}

function scrapeGapsReport(): ScrapeGapsReport {
  const bySystem = systemsBreakdown()
    .map((s) => ({ slug: s.slug, name: s.name, unscraped: s.games - s.scraped }))
    .filter((g) => g.unscraped > 0)
    .sort((a, b) => b.unscraped - a.unscraped);
  return { scrapeGaps: { count: bySystem.reduce((n, g) => n + g.unscraped, 0), bySystem } };
}

// ---------------------------------------------------------------- registry

export type ReportId =
  | "overview"
  | "most-played"
  | "missing"
  | "duplicates"
  | "hashes"
  | "scrape-gaps";

export interface ReportMeta {
  id: ReportId;
  label: string;
  description: string;
  /** True when the report is expensive (shows a warning in the picker). */
  slow?: boolean;
}

export const REPORT_META: ReportMeta[] = [
  { id: "overview", label: "Overview", description: "Usage totals, coverage %, and a per-system breakdown." },
  { id: "most-played", label: "Most played", description: "Top games across all users by play time." },
  { id: "missing", label: "Missing files", description: "Games in the library whose file is gone from disk." },
  { id: "duplicates", label: "Duplicate files", description: "Present files that share an identical content hash." },
  {
    id: "hashes",
    label: "Hash health",
    description: "Verify every hashed game against the No-Intro/Redump/MAME DAT.",
    slow: true,
  },
  { id: "scrape-gaps", label: "Scrape gaps", description: "Games missing metadata/art, grouped by system." },
];

const RUNNERS: Record<ReportId, () => unknown> = {
  overview: overviewReport,
  "most-played": mostPlayedReport,
  missing: missingReport,
  duplicates: duplicatesReport,
  hashes: hashHealthReport,
  "scrape-gaps": scrapeGapsReport,
};

export function isReportId(v: unknown): v is ReportId {
  return typeof v === "string" && v in RUNNERS;
}

/** Run a single report by id. Throws on an unknown id. */
export function runReport(id: ReportId): { id: ReportId; label: string; generatedAt: string; data: unknown } {
  const meta = REPORT_META.find((m) => m.id === id);
  if (!meta) throw new Error(`Unknown report: ${id}`);
  return { id, label: meta.label, generatedAt: new Date().toISOString(), data: RUNNERS[id]() };
}
