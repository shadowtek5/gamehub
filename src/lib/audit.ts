// Set-integrity auditing: classify every hashed ROM against the local DAT hash
// DB (verified / mismatch / unknown), report which games are missing from a
// system's full set, and find byte-identical duplicates. All read-only against
// ROM files — like the rest of the app, auditing never touches the ROMs on
// disk, only the catalog's `dat_status` verdict column.

import { getDb } from "./db";
import { FOLDER_ROM_SLUGS } from "./platforms";
import {
  datConfigured,
  datNormalize,
  datRegionCounts,
  datSlugsWithCoverage,
  datTitlesForSlug,
  datVerify,
} from "./providers/datdb";

export interface AuditJobStatus {
  running: boolean;
  /** ROMs to classify this run. */
  total: number;
  /** ROMs processed so far. */
  done: number;
  verified: number;
  mismatch: number;
  unknown: number;
  /** ROMs with no hash yet — can't be verified, left unchecked. */
  unhashed: number;
  /** Non-archive ROMs whose on-disk size differs from the DAT's expected size. */
  wrongSize: number;
  finishedAt: string | null;
  /** False means the DAT DB isn't imported, so nothing could be checked. */
  datConfigured: boolean;
}

const romSizeMatters = (path: string) => !/\.(zip|7z|rar)$/i.test(path);

const globalAudit = globalThis as unknown as { __auditJob?: AuditJobStatus };

function auditState(): AuditJobStatus {
  if (!globalAudit.__auditJob) {
    globalAudit.__auditJob = {
      running: false,
      total: 0,
      done: 0,
      verified: 0,
      mismatch: 0,
      unknown: 0,
      unhashed: 0,
      wrongSize: 0,
      finishedAt: null,
      datConfigured: false,
    };
  }
  return globalAudit.__auditJob;
}

export function getAuditJobStatus(): AuditJobStatus {
  return { ...auditState() };
}

/** How many ROMs to classify per synchronous chunk. Each chunk is one small
 *  transaction; between chunks we yield to the event loop so the app stays
 *  responsive during a whole-library audit (better-sqlite3 is synchronous, so a
 *  single tight loop over tens of thousands of rows would freeze the server). */
const AUDIT_BATCH = 500;

/** Start a background DAT audit. Returns false if one is already running.
 *  Classifies hashed ROMs and persists each verdict to roms.dat_status. */
export function startDatAudit(systems?: string[]): boolean {
  const s = auditState();
  if (s.running) return false;

  const db = getDb();
  const configured = datConfigured();

  s.running = true;
  s.total = 0;
  s.done = 0;
  s.verified = 0;
  s.mismatch = 0;
  s.unknown = 0;
  s.unhashed = 0;
  s.wrongSize = 0;
  s.finishedAt = null;
  s.datConfigured = configured;
  if (!configured) {
    s.running = false;
    s.finishedAt = new Date().toISOString();
    return true;
  }

  const plat = systems?.length ? ` AND platform_slug IN (${systems.map(() => "?").join(",")})` : "";
  const folderExcl = FOLDER_ROM_SLUGS.length
    ? ` AND platform_slug NOT IN (${FOLDER_ROM_SLUGS.map(() => "?").join(",")})`
    : "";
  const rows = db
    .prepare(
      `SELECT id, title, platform_slug, path, size_bytes, crc32, md5, sha1
       FROM roms WHERE missing = 0${plat}${folderExcl}`
    )
    .all(...(systems ?? []), ...FOLDER_ROM_SLUGS) as {
    id: number;
    title: string;
    platform_slug: string;
    path: string;
    size_bytes: number;
    crc32: string | null;
    md5: string | null;
    sha1: string | null;
  }[];
  s.total = rows.length;

  const setStatus = db.prepare("UPDATE roms SET dat_status = ? WHERE id = ?");
  const classifyBatch = db.transaction((batch: typeof rows) => {
    for (const r of batch) {
      // Unhashed ROMs can't be verified — leave them unchecked (null).
      if (!r.md5 && !r.sha1 && !r.crc32) {
        s.unhashed++;
        setStatus.run(null, r.id);
        continue;
      }
      const v = datVerify(r);
      setStatus.run(v.status, r.id);
      s[v.status]++;
      if (
        v.status === "mismatch" &&
        v.expectedSize != null &&
        romSizeMatters(r.path) &&
        r.size_bytes !== v.expectedSize
      ) {
        s.wrongSize++;
      }
    }
    s.done += batch.length;
  });

  void (async () => {
    try {
      for (let i = 0; i < rows.length; i += AUDIT_BATCH) {
        classifyBatch(rows.slice(i, i + AUDIT_BATCH));
        // Hand the thread back so other requests (and the progress poll) run.
        await new Promise((r) => setImmediate(r));
      }
    } finally {
      s.running = false;
      s.finishedAt = new Date().toISOString();
    }
  })();

  return true;
}

export interface AuditCounts {
  verified: number;
  mismatch: number;
  unknown: number;
  unchecked: number;
}

/** Current stored verdict tallies across the live library (no re-checking). */
export function auditCounts(): AuditCounts {
  const rows = getDb()
    .prepare("SELECT dat_status s, COUNT(*) c FROM roms WHERE missing = 0 GROUP BY dat_status")
    .all() as { s: string | null; c: number }[];
  const out: AuditCounts = { verified: 0, mismatch: 0, unknown: 0, unchecked: 0 };
  for (const r of rows) {
    if (r.s === "verified" || r.s === "mismatch" || r.s === "unknown") out[r.s] = r.c;
    else out.unchecked += r.c;
  }
  return out;
}

export interface SetReport {
  slug: string;
  datTotal: number;
  owned: number;
  missing: number;
  /** The region the report was scoped to for this system (null = all regions). */
  region: string | null;
  /** First N missing canonical titles (capped so the payload stays small). */
  missingSample: string[];
}

/** How the missing-set report scopes region.
 *  - "all": count every region.
 *  - a preferred region ("USA"/"Europe"/"Japan"): count that region's titles,
 *    but fall back per-system to the region that actually exists when your
 *    preferred one has no releases there (e.g. a North-America preference on the
 *    Famicom, which has only Japanese titles, falls back to Japan). */
export type RegionMode = "all" | "USA" | "Europe" | "Japan";

const MISSING_SAMPLE_CAP = 200;

/** Resolve the effective region filter for a system under the chosen mode:
 *  the preferred region if the system has titles there, otherwise the system's
 *  dominant region (so region-exclusive consoles aren't reported as empty). */
function effectiveRegion(slug: string, mode: RegionMode): string | null {
  if (mode === "all") return null;
  const counts = datRegionCounts(slug);
  if ((counts[mode] ?? 0) > 0) return mode;
  // Fallback: the region with the most titles for this system (Japan for
  // Japan-only consoles, etc.). Null when the DAT tags no regions at all.
  let best: string | null = null;
  let bestCount = 0;
  for (const [region, count] of Object.entries(counts)) {
    if (region === "Unknown") continue;
    if (count > bestCount) {
      bestCount = count;
      best = region;
    }
  }
  return best;
}

/** Per-system "which games am I missing" against the full DAT set. Completeness
 *  is measured at the distinct-title level (region/revision variants collapse),
 *  scoped to the main library (variant IS NULL) — hacks/translations aren't in
 *  No-Intro/Redump and would just add noise. `region` scopes which DAT titles
 *  count (default "auto": region-aware, so a Japan-only console isn't reported
 *  as "missing" thousands of Western titles it never had). */
export function datSetReports(systems?: string[], region: RegionMode = "USA"): SetReport[] {
  const db = getDb();
  const covered = new Set(datSlugsWithCoverage());
  const slugs = (systems?.length ? systems : [...covered]).filter((s) => covered.has(s));

  const reports: SetReport[] = [];
  for (const slug of slugs) {
    const effRegion = effectiveRegion(slug, region);
    const titles = datTitlesForSlug(slug, effRegion);
    if (!titles.length) continue;
    const owned = new Set(
      (
        db
          .prepare(
            "SELECT title FROM roms WHERE platform_slug = ? AND missing = 0 AND variant IS NULL"
          )
          .all(slug) as { title: string }[]
      ).map((r) => datNormalize(r.title))
    );
    const missing = titles.filter((t) => !owned.has(t.nameNorm));
    reports.push({
      slug,
      datTotal: titles.length,
      owned: titles.length - missing.length,
      missing: missing.length,
      region: effRegion,
      missingSample: missing.slice(0, MISSING_SAMPLE_CAP).map((t) => t.name),
    });
  }
  reports.sort((a, b) => b.missing - a.missing);
  return reports;
}

export interface DuplicateMember {
  id: number;
  title: string;
  platform_slug: string;
  path: string;
  size_bytes: number;
}
export interface DuplicateGroup {
  md5: string;
  count: number;
  wastedBytes: number; // size of the redundant copies (count-1 × size)
  members: DuplicateMember[];
}

// ---------- 1G1R: same game, different dumps (region/revision variants) ----------

export interface TitleDupMember {
  id: number;
  title: string;
  filename: string;
  region: string | null;
  revision: string | null;
  size_bytes: number;
  /** Has scraped metadata (worth keeping over a bare dump) */
  scraped: boolean;
  dat_status: string | null;
}
export interface TitleDupGroup {
  slug: string;
  /** Filled by the route from the platform registry */
  platform_name: string;
  titleNorm: string;
  /** The keeper's title, for display */
  displayTitle: string;
  count: number;
  /** The copy GameHub recommends keeping (see pickKeeper) */
  suggestedKeepId: number;
  members: TitleDupMember[];
}

// Region preference for the 1G1R keeper: North America, then World, Europe,
// Japan, then anything else, then untagged.
const REGION_RANK: Record<string, number> = {
  USA: 0, U: 0, UE: 0, JU: 0,
  WORLD: 1, W: 1,
  EUROPE: 2, E: 2,
  JAPAN: 3, J: 3,
};
function regionRank(r: string | null): number {
  if (!r) return 6;
  return REGION_RANK[r.toUpperCase()] ?? 5;
}

/** Choose which copy of a title to keep: a DAT-verified dump beats an unverified
 *  one, a scraped entry beats a bare one, then region preference, then the
 *  largest file (most complete), then the oldest row id as a stable tiebreak. */
function pickKeeper(members: TitleDupMember[]): number {
  return [...members].sort((a, b) => {
    const av = a.dat_status === "verified" ? 0 : 1;
    const bv = b.dat_status === "verified" ? 0 : 1;
    if (av !== bv) return av - bv;
    if (a.scraped !== b.scraped) return a.scraped ? -1 : 1;
    const ar = regionRank(a.region);
    const br = regionRank(b.region);
    if (ar !== br) return ar - br;
    if (a.size_bytes !== b.size_bytes) return b.size_bytes - a.size_bytes;
    return a.id - b.id;
  })[0].id;
}

/** Groups of the SAME game held as multiple dumps (region/revision/rename
 *  variants), detected by normalized title within a system — the 1G1R case the
 *  MD5 detector can't see (different bytes). Main library only (variant IS NULL,
 *  so hacks/translations aren't lumped in). Report + suggested keeper only; the
 *  dedupe action HIDES the extras (never deletes files). */
export function findTitleDuplicates(systems?: string[]): TitleDupGroup[] {
  const db = getDb();
  const plat = systems?.length ? ` AND platform_slug IN (${systems.map(() => "?").join(",")})` : "";
  const rows = db
    .prepare(
      `SELECT id, title, filename, region, revision, size_bytes, platform_slug, metadata_source, dat_status
       FROM roms WHERE missing = 0 AND variant IS NULL${plat}`
    )
    .all(...(systems ?? [])) as {
    id: number;
    title: string;
    filename: string;
    region: string | null;
    revision: string | null;
    size_bytes: number;
    platform_slug: string;
    metadata_source: string | null;
    dat_status: string | null;
  }[];

  const groups = new Map<string, TitleDupGroup>();
  for (const r of rows) {
    const norm = datNormalize(r.title);
    if (!norm) continue;
    const key = `${r.platform_slug} ${norm}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        slug: r.platform_slug,
        platform_name: r.platform_slug,
        titleNorm: norm,
        displayTitle: r.title,
        count: 0,
        suggestedKeepId: 0,
        members: [],
      };
      groups.set(key, g);
    }
    g.members.push({
      id: r.id,
      title: r.title,
      filename: r.filename,
      region: r.region,
      revision: r.revision,
      size_bytes: r.size_bytes,
      scraped: !!r.metadata_source,
      dat_status: r.dat_status,
    });
  }

  const out: TitleDupGroup[] = [];
  for (const g of groups.values()) {
    if (g.members.length < 2) continue;
    g.count = g.members.length;
    g.suggestedKeepId = pickKeeper(g.members);
    const keeper = g.members.find((m) => m.id === g.suggestedKeepId);
    if (keeper) g.displayTitle = keeper.title;
    // Keeper first, rest after (stable) — so the UI can render it as the default.
    g.members.sort((a, b) =>
      a.id === g.suggestedKeepId ? -1 : b.id === g.suggestedKeepId ? 1 : 0
    );
    out.push(g);
  }
  out.sort((a, b) => b.count - a.count || a.displayTitle.localeCompare(b.displayTitle));
  return out;
}

/** Byte-identical ROMs, grouped by MD5 (computed for every hashed ROM). Catches
 *  the same dump duplicated across folders/systems regardless of filename.
 *  Report only — the app never deletes ROM files. */
export function findDuplicates(systems?: string[]): DuplicateGroup[] {
  const db = getDb();
  const plat = systems?.length ? ` AND platform_slug IN (${systems.map(() => "?").join(",")})` : "";
  const dupHashes = db
    .prepare(
      `SELECT md5, COUNT(*) c FROM roms
       WHERE md5 IS NOT NULL AND missing = 0${plat}
       GROUP BY md5 HAVING c > 1 ORDER BY c DESC`
    )
    .all(...(systems ?? [])) as { md5: string; c: number }[];

  const memberStmt = db.prepare(
    `SELECT id, title, platform_slug, path, size_bytes FROM roms
     WHERE md5 = ? AND missing = 0 ORDER BY path`
  );
  return dupHashes.map(({ md5, c }) => {
    const members = memberStmt.all(md5) as DuplicateMember[];
    const size = members[0]?.size_bytes ?? 0;
    return { md5, count: c, wastedBytes: size * (c - 1), members };
  });
}
