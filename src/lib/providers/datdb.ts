// Local hash database built from libretro-database DAT files (No-Intro carts,
// Redump discs, MAME/FBNeo arcade). Given a ROM's CRC32/MD5/SHA1 it returns the
// canonical dump name + our platform slug — the exact-match key that makes
// EmuMovies pack art (named to No-Intro/Redump sets) line up 1:1, and a stronger
// signal than filename matching for renamed/obscure dumps.
//
// Same pattern as launchbox.ts: download once, parse into a local SQLite, then
// lookups are instant local queries. The libretro DATs are the clrmamepro text
// format (NOT XML):
//   game ( name "Foo (USA)" rom ( name "Foo (USA).nes" size 40976 crc a1b2c3d4 md5 .. sha1 .. ) )
// and each DAT's filename equals a platform's `libretroName`, so DAT→slug is
// deterministic via platformByLibretroName().

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { platformByLibretroName } from "../platforms";
import { getDataDir } from "../dataDir";

const CONTENTS_API_BASE = "https://api.github.com/repos/libretro/libretro-database/contents/metadat";
const RAW_BASE = "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat";

/** Importable DAT categories → the libretro-database `metadat/` subfolder that
 *  holds their per-system clrmamepro DATs (with crc/md5/sha1) and the `source`
 *  we tag them with. The `/dat` folder is NOT used — it's mostly homebrew and
 *  covers almost nothing; the real No-Intro/Redump/MAME sets live under
 *  `/metadat`. Cartridges + discs are the default; the arcade/computer sets are
 *  large and opt-in. */
export interface DatCategory {
  key: string;
  label: string;
  folder: string;
  source: string;
  note: string;
  /** Selected by default in the import UI. */
  default: boolean;
}
export const DAT_CATEGORIES: DatCategory[] = [
  { key: "no-intro", label: "No-Intro (cartridges)", folder: "no-intro", source: "no-intro", note: "NES, SNES, Game Boy, Genesis, N64, DS… every cartridge system.", default: true },
  { key: "redump", label: "Redump (discs)", folder: "redump", source: "redump", note: "PlayStation, PS2, Saturn, Dreamcast, GameCube, Wii… disc systems.", default: true },
  { key: "fbneo", label: "FinalBurn Neo (arcade)", folder: "fbneo-split", source: "mame", note: "Arcade sets — needed for arcade/Neo Geo coverage.", default: false },
  { key: "mame", label: "MAME (arcade, large)", folder: "mame", source: "mame", note: "Full MAME set — very large download.", default: false },
  { key: "tosec", label: "TOSEC (computers, large)", folder: "tosec", source: "other", note: "Amiga, C64, DOS, MSX, ZX Spectrum… mostly unmapped, large.", default: false },
];
const DEFAULT_CATEGORY_KEYS = DAT_CATEGORIES.filter((c) => c.default).map((c) => c.key);

// ---------- local database ----------

const globalDat = globalThis as unknown as {
  __datDb?: Database.Database;
  __datCount?: { value: number; at: number };
  __datImport?: DatImportStatus;
};

function datDb(): Database.Database {
  if (!globalDat.__datDb) {
    const dir = getDataDir();
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, "dat.db"));
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY,
        slug TEXT,               -- our platform slug (null if unmapped)
        dat_name TEXT NOT NULL,  -- source DAT system name (== libretroName)
        source TEXT NOT NULL,    -- 'no-intro' | 'redump' | 'mame' | 'other'
        name TEXT NOT NULL,      -- canonical dump name
        name_norm TEXT NOT NULL,
        region TEXT,
        custom INTEGER NOT NULL DEFAULT 0, -- 1 = user-uploaded (survives libretro re-import)
        dat_file TEXT            -- custom DATs: the uploaded file label (removal key)
      );
      CREATE INDEX IF NOT EXISTS idx_dat_games_norm ON games(slug, name_norm);
      CREATE INDEX IF NOT EXISTS idx_dat_games_custom ON games(custom, dat_file);
      CREATE TABLE IF NOT EXISTS entries (
        game_id INTEGER NOT NULL,
        rom_name TEXT,
        size INTEGER,
        crc32 TEXT,
        md5 TEXT,
        sha1 TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_dat_crc ON entries(crc32);
      CREATE INDEX IF NOT EXISTS idx_dat_md5 ON entries(md5);
      CREATE INDEX IF NOT EXISTS idx_dat_sha1 ON entries(sha1);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    // Additive migration for dat.db created before custom-DAT support.
    const cols = new Set(
      (db.prepare("PRAGMA table_info(games)").all() as { name: string }[]).map((c) => c.name)
    );
    if (!cols.has("custom")) db.exec("ALTER TABLE games ADD COLUMN custom INTEGER NOT NULL DEFAULT 0");
    if (!cols.has("dat_file")) db.exec("ALTER TABLE games ADD COLUMN dat_file TEXT");
    globalDat.__datDb = db;
  }
  return globalDat.__datDb;
}

/** Imported and non-empty? Cached briefly. */
export function datConfigured(): boolean {
  const now = Date.now();
  if (!globalDat.__datCount || now - globalDat.__datCount.at > 60_000) {
    try {
      const c = (datDb().prepare("SELECT COUNT(*) c FROM games").get() as { c: number }).c;
      globalDat.__datCount = { value: c, at: now };
    } catch {
      globalDat.__datCount = { value: 0, at: now };
    }
  }
  return globalDat.__datCount.value > 0;
}

export function datStatus(): {
  games: number;
  entries: number;
  systems: number;
  importedAt: string | null;
} {
  try {
    const db = datDb();
    const games = (db.prepare("SELECT COUNT(*) c FROM games").get() as { c: number }).c;
    const entries = (db.prepare("SELECT COUNT(*) c FROM entries").get() as { c: number }).c;
    const systems = (db.prepare("SELECT COUNT(DISTINCT dat_name) c FROM games").get() as { c: number }).c;
    const importedAt =
      (db.prepare("SELECT value FROM meta WHERE key='imported_at'").get() as { value: string } | undefined)
        ?.value ?? null;
    return { games, entries, systems, importedAt };
  } catch {
    return { games: 0, entries: 0, systems: 0, importedAt: null };
  }
}

// ---------- lookups ----------

export interface DatMatch {
  name: string;
  region: string | null;
  slug: string | null;
  datName: string;
  source: string;
}

function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Same title normalization the DAT DB uses, exported so the audit can compare
 *  library titles against DAT names identically. */
export function datNormalize(s: string): string {
  return normName(s);
}

const REGIONS = [
  "USA", "Europe", "Japan", "World", "Asia", "Australia", "Brazil", "Canada",
  "China", "France", "Germany", "Italy", "Korea", "Netherlands", "Spain",
  "Sweden", "UK", "Taiwan",
];
function regionOf(name: string): string | null {
  const paren = name.match(/\(([^)]*)\)/g) ?? [];
  for (const group of paren) {
    for (const part of group.slice(1, -1).split(/,\s*/)) {
      if (REGIONS.includes(part)) return part;
    }
  }
  return null;
}

/** Exact match by file hash (md5 → sha1 → crc32, most reliable first). */
export function datLookupByHash(hashes: {
  crc32?: string | null;
  md5?: string | null;
  sha1?: string | null;
}): DatMatch | null {
  const db = datDb();
  const tries: [string, string | null | undefined][] = [
    ["md5", hashes.md5?.toLowerCase()],
    ["sha1", hashes.sha1?.toLowerCase()],
    ["crc32", hashes.crc32?.toLowerCase().padStart(8, "0")],
  ];
  for (const [col, val] of tries) {
    if (!val) continue;
    const row = db
      .prepare(
        `SELECT g.name, g.region, g.slug, g.dat_name AS datName, g.source
         FROM entries e JOIN games g ON g.id = e.game_id
         WHERE e.${col} = ? LIMIT 1`
      )
      .get(val) as DatMatch | undefined;
    if (row) return row;
  }
  return null;
}

/** Fallback name match within a system (canonical No-Intro name for a title). */
export function datLookupByName(slug: string, title: string): DatMatch | null {
  const row = datDb()
    .prepare(
      `SELECT name, region, slug, dat_name AS datName, source
       FROM games WHERE slug = ? AND name_norm = ? LIMIT 1`
    )
    .get(slug, normName(title)) as DatMatch | undefined;
  return row ?? null;
}

/** The canonical No-Intro/Redump name for a ROM (by hash, else by title within
 *  its system), falling back to the raw title. Used so metadata/art lookups —
 *  scraper AND the picker candidate routes — identify a game the same way. */
export function datIdentityName(rom: {
  crc32?: string | null;
  md5?: string | null;
  sha1?: string | null;
  title: string;
  platform_slug: string;
}): string {
  if (!datConfigured()) return rom.title;
  try {
    const dat =
      datLookupByHash({ crc32: rom.crc32, md5: rom.md5, sha1: rom.sha1 }) ??
      datLookupByName(rom.platform_slug, rom.title);
    return dat?.name ?? rom.title;
  } catch {
    return rom.title;
  }
}

// ---------- audit / verification ----------

export type DatVerdict = "verified" | "mismatch" | "unknown";

export interface DatVerifyResult {
  status: DatVerdict;
  canonicalName?: string;
  /** Expected uncompressed size from the DAT (null if the DAT omits it). */
  expectedSize?: number | null;
}

/** Classify a ROM against the local DAT DB using its stored hashes.
 *  - verified: some hash (md5→sha1→crc32) matches a DAT dump exactly.
 *  - mismatch: no hash match, but the title is a known DAT game for this system
 *    (a bad dump, a hack, or a different revision — worth a look).
 *  - unknown:  not found by hash or title in any loaded DAT.
 *  Caller should only pass ROMs that actually have a hash; a hashless ROM can
 *  never be "verified", so it's treated as unchecked upstream. */
export function datVerify(rom: {
  crc32?: string | null;
  md5?: string | null;
  sha1?: string | null;
  title: string;
  platform_slug: string;
}): DatVerifyResult {
  const db = datDb();
  const tries: [string, string | null | undefined][] = [
    ["md5", rom.md5?.toLowerCase()],
    ["sha1", rom.sha1?.toLowerCase()],
    ["crc32", rom.crc32?.toLowerCase().padStart(8, "0")],
  ];
  for (const [col, val] of tries) {
    if (!val) continue;
    const row = db
      .prepare(
        `SELECT g.name AS name, e.size AS size
         FROM entries e JOIN games g ON g.id = e.game_id
         WHERE e.${col} = ? LIMIT 1`
      )
      .get(val) as { name: string; size: number | null } | undefined;
    if (row) return { status: "verified", canonicalName: row.name, expectedSize: row.size };
  }
  const named = db
    .prepare(`SELECT id, name FROM games WHERE slug = ? AND name_norm = ? LIMIT 1`)
    .get(rom.platform_slug, normName(rom.title)) as { id: number; name: string } | undefined;
  if (named) {
    const sz = db
      .prepare(`SELECT size FROM entries WHERE game_id = ? AND size IS NOT NULL LIMIT 1`)
      .get(named.id) as { size: number } | undefined;
    return { status: "mismatch", canonicalName: named.name, expectedSize: sz?.size ?? null };
  }
  return { status: "unknown" };
}

/** Platform slugs that have any DAT coverage loaded — the systems an audit /
 *  missing-set report can meaningfully run against. */
export function datSlugsWithCoverage(): string[] {
  try {
    return (
      datDb()
        .prepare("SELECT DISTINCT slug FROM games WHERE slug IS NOT NULL")
        .all() as { slug: string }[]
    ).map((r) => r.slug);
  } catch {
    return [];
  }
}

export interface DatTitle {
  name: string;
  nameNorm: string;
  region: string | null;
}

/** Distinct canonical titles the DAT knows for a system (deduped by normalized
 *  name so region/revision variants collapse to one game). Used by the
 *  missing-from-set report. With `region`, only titles released in that region
 *  (plus World releases, which apply everywhere) are counted. */
export function datTitlesForSlug(slug: string, region?: string | null): DatTitle[] {
  const where = region ? " AND (region = ? OR region = 'World')" : "";
  const params = region ? [slug, region] : [slug];
  return datDb()
    .prepare(
      `SELECT name, name_norm AS nameNorm, region FROM games
       WHERE slug = ?${where} GROUP BY name_norm ORDER BY name`
    )
    .all(...params) as DatTitle[];
}

/** Region → title count for a system's DAT games, so callers can tell a
 *  Japan-only console (no USA/Europe titles) from a multi-region one. */
export function datRegionCounts(slug: string): Record<string, number> {
  const rows = datDb()
    .prepare(
      `SELECT COALESCE(region, '') r, COUNT(*) c FROM games WHERE slug = ? GROUP BY region`
    )
    .all(slug) as { r: string; c: number }[];
  const out: Record<string, number> = {};
  for (const row of rows) out[row.r || "Unknown"] = row.c;
  return out;
}

// ---------- import job ----------

export interface DatImportStatus {
  running: boolean;
  phase: "idle" | "listing" | "downloading" | "done" | "error";
  filesDone: number;
  filesTotal: number;
  currentFile: string;
  games: number;
  entries: number;
  error?: string;
}

export function getDatImportStatus(): DatImportStatus {
  return (
    globalDat.__datImport ?? {
      running: false,
      phase: "idle",
      filesDone: 0,
      filesTotal: 0,
      currentFile: "",
      games: 0,
      entries: 0,
    }
  );
}

/** Kick off the download + import in the background. False if already running.
 *  `categories` selects which metadat/ folders to pull (keys from
 *  DAT_CATEGORIES); defaults to cartridges + discs. */
export function startDatImport(categories?: string[]): boolean {
  const s = getDatImportStatus();
  if (s.running) return false;
  const keys = categories?.length ? categories : DEFAULT_CATEGORY_KEYS;
  const cats = DAT_CATEGORIES.filter((c) => keys.includes(c.key));
  const status: DatImportStatus = {
    running: true,
    phase: "listing",
    filesDone: 0,
    filesTotal: 0,
    currentFile: "",
    games: 0,
    entries: 0,
  };
  globalDat.__datImport = status;

  void (async () => {
    try {
      // ---- list each selected metadat/<folder> ----
      const files: { name: string; downloadUrl: string | null; folder: string; source: string }[] = [];
      for (const cat of cats.length ? cats : DAT_CATEGORIES.filter((c) => c.default)) {
        const res = await fetch(`${CONTENTS_API_BASE}/${cat.folder}`, {
          headers: { Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new Error(`GitHub listing failed for ${cat.folder} (HTTP ${res.status})`);
        const listing = (await res.json()) as { name: string; download_url: string | null; type?: string }[];
        for (const f of listing) {
          if (f.type === "dir" || !f.name.endsWith(".dat")) continue;
          files.push({ name: f.name, downloadUrl: f.download_url, folder: cat.folder, source: cat.source });
        }
      }
      status.filesTotal = files.length;
      status.phase = "downloading";

      const db = datDb();
      // Wipe only the libretro-managed rows — user-uploaded custom DATs (custom
      // = 1) survive a re-import.
      db.exec(
        `DELETE FROM entries WHERE game_id IN (SELECT id FROM games WHERE custom = 0);
         DELETE FROM games WHERE custom = 0;
         DELETE FROM meta;`
      );
      const insGame = db.prepare(
        `INSERT INTO games (slug, dat_name, source, name, name_norm, region)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      const insEntry = db.prepare(
        "INSERT INTO entries (game_id, rom_name, size, crc32, md5, sha1) VALUES (?, ?, ?, ?, ?, ?)"
      );

      for (const file of files) {
        status.currentFile = file.name;
        const datName = file.name.replace(/\.dat$/i, "");
        const slug = platformByLibretroName(datName)?.slug ?? null;
        // Source is known from the folder — no need to sniff the header.
        const source = file.source;

        const raw = await fetch(
          file.downloadUrl ?? `${RAW_BASE}/${file.folder}/${encodeURIComponent(file.name)}`,
          { signal: AbortSignal.timeout(600_000) }
        );
        if (!raw.ok || !raw.body) {
          status.filesDone++;
          continue;
        }

        // Stream-parse clrmamepro game blocks so an 80MB MAME DAT never has to
        // sit in memory whole.
        await new Promise<void>((resolve, reject) => {
          let buf = "\n"; // leading \n so the first block token matches
          const stream = Readable.fromWeb(raw.body as import("stream/web").ReadableStream);
          stream.setEncoding("utf8");

          const flush = db.transaction((games: ParsedGame[]) => {
            for (const g of games) {
              const info = insGame.run(slug, datName, source, g.name, normName(g.name), regionOf(g.name));
              const gid = info.lastInsertRowid as number;
              for (const r of g.roms) insEntry.run(gid, r.name, r.size, r.crc, r.md5, r.sha1);
              status.games++;
              status.entries += g.roms.length;
            }
          });

          let batch: ParsedGame[] = [];
          stream.on("data", (chunk: string) => {
            buf += chunk;
            for (;;) {
              const block = nextBlock(buf);
              if (!block) break;
              const g = parseGame(block.body);
              if (g) batch.push(g);
              buf = buf.slice(block.end);
            }
            if (batch.length >= 2000) { flush(batch); batch = []; }
          });
          stream.on("end", () => {
            try { if (batch.length) flush(batch); resolve(); } catch (e) { reject(e); }
          });
          stream.on("error", reject);
        });

        status.filesDone++;
      }

      db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('imported_at', ?)").run(
        new Date().toISOString()
      );
      status.phase = "done";
    } catch (e) {
      status.phase = "error";
      status.error = e instanceof Error ? e.message : String(e);
    } finally {
      status.running = false;
      status.currentFile = "";
      globalDat.__datCount = undefined; // force datConfigured() recheck
    }
  })();

  return true;
}

// ---------- custom (user-uploaded) DATs ----------

function detectSource(headerComment: string, filename: string): string {
  const s = `${headerComment} ${filename}`.toLowerCase();
  if (/no-intro/.test(s)) return "no-intro";
  if (/redump/.test(s)) return "redump";
  if (/\bmame\b|fbneo|arcade/.test(s)) return "mame";
  return "other";
}

export interface CustomDat {
  label: string;
  datName: string;
  slug: string | null;
  source: string;
  games: number;
}

/** Import a user-supplied clrmamepro .dat into the hash DB, tagged custom = 1 so
 *  it survives libretro re-imports. Re-uploading the same label replaces it.
 *  Parsed in-memory (admin action on a single file), returns the counts. */
export function importCustomDat(label: string, text: string): { games: number; entries: number } {
  const db = datDb();
  const cleanLabel = (label.replace(/\.dat$/i, "").trim() || "custom").slice(0, 120);

  // Two DAT flavors in the wild: clrmamepro TEXT (libretro-database) and the
  // No-Intro/Redump Dat-o-Matic XML (`<datafile><game><rom .../></game>`).
  const isXml = /<\?xml|<datafile[\s>]/i.test(text.slice(0, 1000));
  const head = text.slice(0, isXml ? 20000 : 8192);

  let datName: string;
  let source: string;
  if (isXml) {
    const hName =
      head.match(/<header>[\s\S]*?<name>([^<]*)<\/name>/i)?.[1] ??
      head.match(/<name>([^<]*)<\/name>/i)?.[1];
    datName = (hName ? xmlDecode(hName.trim()) : "") || cleanLabel;
    source = detectSource(head, `${datName} ${cleanLabel}`); // header carries No-Intro/Redump/url
  } else {
    const hName =
      head.match(/clrmamepro\s*\([\s\S]*?\bname\s+"([^"]*)"/i)?.[1] ??
      head.match(/\bname\s+"([^"]*)"/)?.[1];
    const comment = head.match(/\bcomment\s+"([^"]*)"/i)?.[1] ?? "";
    datName = hName || cleanLabel;
    source = detectSource(comment, `${datName} ${cleanLabel}`);
  }
  const slug = platformByLibretroName(datName)?.slug ?? null;

  // Replace any prior upload under the same label.
  removeCustomDat(cleanLabel);

  const insGame = db.prepare(
    `INSERT INTO games (slug, dat_name, source, name, name_norm, region, custom, dat_file)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
  );
  const insEntry = db.prepare(
    "INSERT INTO entries (game_id, rom_name, size, crc32, md5, sha1) VALUES (?, ?, ?, ?, ?, ?)"
  );

  let games = 0;
  let entries = 0;
  db.transaction(() => {
    for (const g of isXml ? xmlDatGames(text) : clrmameproGames(text)) {
      const info = insGame.run(slug, datName, source, g.name, normName(g.name), regionOf(g.name), cleanLabel);
      const gid = info.lastInsertRowid as number;
      for (const r of g.roms) insEntry.run(gid, r.name, r.size, r.crc, r.md5, r.sha1);
      games++;
      entries += g.roms.length;
    }
  })();
  globalDat.__datCount = undefined; // force datConfigured() recheck
  return { games, entries };
}

/** Decode the handful of XML entities that appear in DAT game/rom names. */
function xmlDecode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0*39;|&#x0*27;/gi, "'");
}

/** Iterate games from a clrmamepro TEXT dat. */
function* clrmameproGames(text: string): Generator<ParsedGame> {
  let buf = "\n" + text; // leading \n so the first block token matches
  for (;;) {
    const block = nextBlock(buf);
    if (!block) break;
    const g = parseGame(block.body);
    buf = buf.slice(block.end);
    if (g) yield g;
  }
}

/** Iterate games from a No-Intro/Redump Dat-o-Matic XML dat. */
function* xmlDatGames(text: string): Generator<ParsedGame> {
  const gameRe = /<game\b([^>]*)>([\s\S]*?)<\/game>/g;
  let gm: RegExpExecArray | null;
  while ((gm = gameRe.exec(text))) {
    const name = gm[1].match(/\bname="([^"]*)"/)?.[1];
    if (!name) continue;
    const roms: ParsedRom[] = [];
    const romRe = /<rom\b([^>]*)>/g;
    let rm: RegExpExecArray | null;
    while ((rm = romRe.exec(gm[2]))) {
      const a = rm[1];
      const rname = a.match(/\bname="([^"]*)"/)?.[1];
      const size = a.match(/\bsize="(\d+)"/)?.[1];
      const crc = a.match(/\bcrc="([0-9a-fA-F]+)"/)?.[1];
      const md5 = a.match(/\bmd5="([0-9a-fA-F]+)"/)?.[1];
      const sha1 = a.match(/\bsha1="([0-9a-fA-F]+)"/)?.[1];
      roms.push({
        name: rname ? xmlDecode(rname) : null,
        size: size ? Number(size) : null,
        crc: crc ? crc.toLowerCase().padStart(8, "0") : null,
        md5: md5 ? md5.toLowerCase() : null,
        sha1: sha1 ? sha1.toLowerCase() : null,
      });
    }
    yield { name: xmlDecode(name), roms };
  }
}

/** The user-uploaded DATs currently in the hash DB, grouped by upload label. */
export function listCustomDats(): CustomDat[] {
  try {
    return datDb()
      .prepare(
        `SELECT dat_file AS label, MIN(dat_name) AS datName, MIN(slug) AS slug,
                MIN(source) AS source, COUNT(*) AS games
         FROM games WHERE custom = 1 AND dat_file IS NOT NULL
         GROUP BY dat_file ORDER BY dat_file`
      )
      .all() as CustomDat[];
  } catch {
    return [];
  }
}

/** Remove a custom DAT (its games + entries) by upload label. Returns rows removed. */
export function removeCustomDat(label: string): number {
  const db = datDb();
  const n = db.transaction(() => {
    db.prepare(
      "DELETE FROM entries WHERE game_id IN (SELECT id FROM games WHERE custom = 1 AND dat_file = ?)"
    ).run(label);
    return db.prepare("DELETE FROM games WHERE custom = 1 AND dat_file = ?").run(label).changes as number;
  })();
  globalDat.__datCount = undefined;
  return n;
}

// ---------- clrmamepro parsing ----------

interface ParsedRom {
  name: string | null;
  size: number | null;
  crc: string | null;
  md5: string | null;
  sha1: string | null;
}
interface ParsedGame {
  name: string;
  roms: ParsedRom[];
}

/** Find the next complete `game (…\n)` or `machine (…\n)` block in `buf`.
 *  Returns its inner body + the offset just past its closing `\n)`. */
function nextBlock(buf: string): { body: string; end: number } | null {
  let start = -1;
  let tokenLen = 0;
  for (const token of ["\ngame (", "\nmachine ("]) {
    const i = buf.indexOf(token);
    if (i !== -1 && (start === -1 || i < start)) {
      start = i;
      tokenLen = token.length;
    }
  }
  if (start === -1) return null;
  const close = buf.indexOf("\n)", start + tokenLen);
  if (close === -1) return null;
  return { body: buf.slice(start + tokenLen, close), end: close + 2 };
}

function parseGame(body: string): ParsedGame | null {
  const nameM = body.match(/name\s+"([^"]*)"/);
  if (!nameM) return null;
  const roms: ParsedRom[] = [];
  // Consume the quoted rom name first — its value can contain "(" / ")" (region
  // tags like "(Japan)"), so a naive [^)]* would truncate before the hashes.
  // Everything after the name (size/crc/md5/sha1) is bare tokens with no parens.
  const romRe = /rom\s*\(\s*name\s+"([^"]*)"([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = romRe.exec(body))) {
    const name = m[1];
    const r = m[2];
    const sizeM = r.match(/\bsize\s+(\d+)/);
    roms.push({
      name,
      size: sizeM ? Number(sizeM[1]) : null,
      crc: r.match(/\bcrc\s+([0-9a-fA-F]+)/)?.[1]?.toLowerCase().padStart(8, "0") ?? null,
      md5: r.match(/\bmd5\s+([0-9a-fA-F]+)/)?.[1]?.toLowerCase() ?? null,
      sha1: r.match(/\bsha1\s+([0-9a-fA-F]+)/)?.[1]?.toLowerCase() ?? null,
    });
  }
  return { name: nameM[1], roms };
}
