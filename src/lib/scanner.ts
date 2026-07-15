import fs from "fs";
import path from "path";
import { getDb, getLibraryPaths, getSystemFolders, getHiddenSystems } from "./db";
import {
  Platform,
  PLATFORMS,
  platformByExtension,
  platformByFolder,
  AMBIGUOUS_EXTENSIONS,
} from "./platforms";
import { parseLanguages } from "./language";

export interface ScanResult {
  scanned: number;
  added: number;
  updated: number;
  /** Rows repointed to a renamed/moved file (scraped data carried over) */
  moved: number;
  markedMissing: number;
  errors: string[];
  /** Sample of titles newly added this scan (capped) — for the Activity Log. */
  addedTitles: string[];
  /** Sample of titles marked missing this scan (capped) — for the Activity Log. */
  removedTitles: string[];
  /** Row ids of games newly inserted this scan — drives the auto-scrape of just
   *  the new games (no cap; the caller decides what to do with them). */
  addedIds: number[];
}

/** How many sample titles to carry back per scan for the Activity Log summary. */
const TITLE_SAMPLE_CAP = 20;

/** Folder names that mark a variant library paired to a parent system */
export const VARIANT_KEYWORDS: Record<string, string> = {
  hack: "hacks",
  hacks: "hacks",
  romhack: "hacks",
  romhacks: "hacks",
  translation: "translations",
  translations: "translations",
  translated: "translations",
  transalated: "translations", // common typo, seen in the wild
  "fan translations": "translations",
  digital: "digital",
  eshop: "digital",
  dsiware: "digital",
  psn: "digital",
  "live arcade": "digital",
  xbla: "digital",
  dlc: "dlc",
  update: "updates",
  updates: "updates",
  "texture pack": "texture packs",
  "texture packs": "texture packs",
  cia: "cia",
  homebrew: "homebrew",
  prototype: "prototypes",
  prototypes: "prototypes",
  proto: "prototypes",
  protos: "prototypes",
  beta: "betas",
  betas: "betas",
  demo: "demos",
  demos: "demos",
};

/** Strip No-Intro/GoodTools tags: "Chrono Trigger (USA) [!]" -> "Chrono Trigger" */
export function cleanTitle(filename: string): { title: string; region: string | null } {
  const base = filename
    .replace(/\.[^.]+$/, "")
    // Drop a leading collection/library index — Switch NSP/XCI sets ship every
    // file prefixed with one ("00002 - Mario Kart 8 Deluxe", "z0122 - Super
    // Mario Maker 2"). Left in, it poisons every name-based scraper match. The
    // zero-pad / "z" prefix keeps this from eating real titles like
    // "007 - Agent Under Fire" or "2064 - Read Only Memories". Single strip only.
    .replace(/^(?:z\d{2,4}|0\d{3,4})\s*-\s*/i, "");
  let region: string | null = null;
  const regionMatch = base.match(/\((USA|Europe|Japan|World|U|E|J|JU|UE)[^)]*\)/i);
  if (regionMatch) region = regionMatch[1].toUpperCase();

  let title = base
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const articleMatch = title.match(/^(.*), (The|A|An)$/i);
  if (articleMatch) title = `${articleMatch[2]} ${articleMatch[1]}`;
  return { title: title || base, region };
}

export function sortTitle(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, "").toLowerCase();
}

/** Disc marker in a filename: "(Disc 2)", "[CD 1]", "- Disk 3", "(Disc 1 of 4)" */
export function parseDiscNumber(filename: string): number | null {
  const base = filename.replace(/\.[^.]+$/, "");
  const m = base.match(/[([\s._-](?:dis[ck]|cd)[\s._#-]*(\d{1,2})\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Revision/version tag: "(Rev A)", "(Rev 2)", "(v1.1)", "(Version 1.03)".
 *  Normalized to "Rev A" / "v1.1"; null when the filename carries none. */
export function parseRevision(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/, "");
  const rev = base.match(/\(Rev\s*([0-9A-Za-z]+)\)/i);
  if (rev) return `Rev ${rev[1].toUpperCase()}`;
  const ver = base.match(/\((?:v|version)\s*([0-9][0-9.]*)\)/i);
  if (ver) return `v${ver[1]}`;
  return null;
}

function resolvePlatformHeuristic(filePath: string): Platform | undefined {
  const ext = path.extname(filePath).toLowerCase();
  const direct = platformByExtension(ext);
  if (direct) return direct;
  if (!AMBIGUOUS_EXTENSIONS.includes(ext)) return undefined;
  let dir = path.dirname(filePath);
  for (let i = 0; i < 4; i++) {
    const folder = path.basename(dir);
    if (!folder) break;
    const p = platformByFolder(folder);
    if (p) return p;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** Variant tag from a file's directory path relative to its system folder */
function variantFromSubpath(relPath: string): string | null {
  const parts = path.dirname(relPath).toLowerCase().split(/[\\/]/);
  for (const part of parts) {
    if (VARIANT_KEYWORDS[part]) return VARIANT_KEYWORDS[part];
  }
  return null;
}

/** The folder-ROM platform for a directory (e.g. an extracted Wii U title), or
 *  undefined. Returns undefined for files (readdir throws) so it's safe on any
 *  path. */
function folderRomPlatform(dir: string): Platform | undefined {
  let names: Set<string>;
  try {
    names = new Set(fs.readdirSync(dir).map((n) => n.toLowerCase()));
  } catch {
    return undefined;
  }
  return PLATFORMS.find(
    (p) => p.folderRom && p.folderRom.requires.every((r) => names.has(r.toLowerCase()))
  );
}

/** Recursive byte size of a directory's contents (for folder-based ROMs). */
function folderSize(dir: string, depth = 0): number {
  if (depth > 10) return 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      if (e.isDirectory()) total += folderSize(full, depth + 1);
      else if (e.isFile()) total += fs.statSync(full).size;
    } catch {}
  }
  return total;
}

interface WalkHit {
  path: string;
  /** Set when this path is a folder-based ROM directory (not a plain file) */
  folderRom?: Platform;
}

function* walk(dir: string, depth = 0): Generator<WalkHit> {
  if (depth > 8) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // An extracted folder-ROM (e.g. Wii U) is one game — record it, don't
      // descend into its code/content/meta guts.
      const frp = folderRomPlatform(full);
      if (frp) {
        yield { path: full, folderRom: frp };
        continue;
      }
      yield* walk(full, depth + 1);
    } else if (entry.isFile()) {
      yield { path: full };
    }
  }
}

interface FileHit {
  filePath: string;
  platform: Platform;
  variant: string | null;
}

function scanMappedFolder(
  root: string,
  mapped: Platform,
  mappedVariant: string | null,
  excludePaths: string[]
): FileHit[] {
  const hits: FileHit[] = [];
  for (const { path: filePath, folderRom } of walk(root)) {
    const lower = filePath.toLowerCase();
    if (excludePaths.some((p) => lower.startsWith(p.toLowerCase() + path.sep))) continue;
    // Folder-based ROM (e.g. an extracted Wii U title): its structure names the
    // system unambiguously, so record the folder as one game.
    if (folderRom) {
      hits.push({
        filePath,
        platform: folderRom,
        variant: mappedVariant ?? variantFromSubpath(path.relative(root, filePath)),
      });
      continue;
    }
    const ext = path.extname(filePath).toLowerCase();
    // The mapping tells us the system, so archives/disc images are trusted;
    // a unique extension from another system (stray file) still wins.
    const extPlatform = platformByExtension(ext);
    const acceptable =
      !!extPlatform || AMBIGUOUS_EXTENSIONS.includes(ext) || ext === ".zip" || ext === ".7z";
    if (!acceptable) continue;
    if (ext === ".bin" && fs.existsSync(filePath.replace(/\.bin$/i, ".cue"))) continue;

    const rel = path.relative(root, filePath);
    // The mapping wins unless the extension belongs to a genuinely different
    // family (same emulator core = regional sibling, e.g. .md in a Genesis
    // folder or .fds in a Famicom folder stays with the mapped system).
    const platform =
      extPlatform && extPlatform.ejsCore !== mapped.ejsCore ? extPlatform : mapped;
    hits.push({
      filePath,
      platform,
      variant: mappedVariant ?? variantFromSubpath(rel),
    });
  }
  return hits;
}

function scanGenericRoot(root: string, excludePaths: string[]): FileHit[] {
  const hits: FileHit[] = [];
  for (const { path: filePath, folderRom } of walk(root)) {
    const lower = filePath.toLowerCase();
    if (excludePaths.some((p) => lower.startsWith(p.toLowerCase() + path.sep))) continue;
    if (folderRom) {
      hits.push({
        filePath,
        platform: folderRom,
        variant: variantFromSubpath(path.relative(root, filePath)),
      });
      continue;
    }
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".bin" && fs.existsSync(filePath.replace(/\.bin$/i, ".cue"))) continue;
    const platform = resolvePlatformHeuristic(filePath);
    if (!platform) continue;
    hits.push({
      filePath,
      platform,
      variant: variantFromSubpath(path.relative(root, filePath)),
    });
  }
  return hits;
}

export interface ScanOptions {
  /** Restrict the scan to these platform slugs (all non-hidden if omitted) */
  systems?: string[];
}

export function scanLibrary(options: ScanOptions = {}): ScanResult {
  const db = getDb();
  const result: ScanResult = { scanned: 0, added: 0, updated: 0, moved: 0, markedMissing: 0, errors: [], addedTitles: [], removedTitles: [], addedIds: [] };
  const hidden = getHiddenSystems();
  const only = options.systems?.length ? new Set(options.systems) : null;
  const allMappings = getSystemFolders();
  const mappings = allMappings.filter(
    (m) => !hidden.has(m.platform_slug) && (!only || only.has(m.platform_slug))
  );
  // Generic roots only participate in full scans
  const roots = only ? [] : getLibraryPaths();
  if (mappings.length === 0 && roots.length === 0) {
    result.errors.push(
      only
        ? "No visible folders configured for the selected systems."
        : "No folders configured. Add system folders in Settings first."
    );
    return result;
  }

  // Explicit mappings take precedence — exclude them from generic root scans
  const allMappedPaths = allMappings.map((m) => m.path);
  const hits: FileHit[] = [];
  const scannedRoots: string[] = []; // paths actually walked — scopes missing-marking

  for (const m of mappings) {
    if (!fs.existsSync(m.path)) {
      result.errors.push(`Folder not found: ${m.path}`);
      continue;
    }
    const platform = PLATFORMS.find((p) => p.slug === m.platform_slug);
    if (!platform) {
      result.errors.push(`Unknown system "${m.platform_slug}" for ${m.path}`);
      continue;
    }
    const others = allMappedPaths.filter(
      (p) => p !== m.path && p.toLowerCase().startsWith(m.path.toLowerCase() + path.sep)
    );
    hits.push(...scanMappedFolder(m.path, platform, m.variant, others));
    scannedRoots.push(m.path);
  }

  for (const root of roots) {
    if (!fs.existsSync(root)) {
      result.errors.push(`Folder not found: ${root}`);
      continue;
    }
    hits.push(...scanGenericRoot(root, allMappedPaths));
    scannedRoots.push(root);
  }

  // Files whose platform is hidden are skipped entirely
  const visibleHits = hits.filter((h) => !hidden.has(h.platform.slug));
  hits.length = 0;
  hits.push(...visibleHits);

  const seen = new Set<string>();
  const upsert = db.prepare(`
    INSERT INTO roms (path, filename, title, sort_title, platform_slug, size_bytes, boxart_url, region, variant, disc_number, revision, language)
    VALUES (@path, @filename, @title, @sort_title, @platform_slug, @size_bytes, @boxart_url, @region, @variant, @disc_number, @revision, @language)
    ON CONFLICT(path) DO UPDATE SET
      filename = excluded.filename,
      size_bytes = excluded.size_bytes,
      platform_slug = excluded.platform_slug,
      variant = excluded.variant,
      disc_number = excluded.disc_number,
      revision = excluded.revision,
      language = excluded.language,
      missing = 0
  `);
  // Select the fields the ON CONFLICT update touches so we can skip re-writing
  // (and mis-counting as "updated") rows that haven't actually changed on disk.
  const existingByPath = db.prepare(
    "SELECT id, filename, size_bytes, platform_slug, variant, disc_number, revision, language, missing FROM roms WHERE path = ?"
  );
  // Rename/move detection: a file at a NEW path whose (system, exact byte size,
  // normalized title) matches a row whose OLD file no longer exists is the SAME
  // game, moved or renamed. Repoint that row instead of inserting a blank new
  // one and orphaning the old — so scraped metadata, artwork and the row id (its
  // media folder) all follow the file. The disappeared-file check keeps it from
  // stealing a row whose file is still on disk.
  const moveCandidates = db.prepare(
    "SELECT id, path FROM roms WHERE platform_slug = ? AND size_bytes = ? AND sort_title = ?"
  );
  const moveRow = db.prepare(`
    UPDATE roms SET path = @path, filename = @filename, size_bytes = @size_bytes,
      platform_slug = @platform_slug, variant = @variant, disc_number = @disc_number,
      revision = @revision, language = @language, missing = 0
    WHERE id = @id
  `);
  const claimedMove = new Set<number>();

  const scanAll = db.transaction(() => {
    for (const hit of hits) {
      if (seen.has(hit.filePath)) continue;
      result.scanned++;
      const filename = path.basename(hit.filePath);
      const { title, region } = cleanTitle(filename);
      let size = 0;
      try {
        const st = fs.statSync(hit.filePath);
        // Folder-based ROMs (e.g. Wii U) report the whole directory's size.
        size = st.isDirectory() ? folderSize(hit.filePath) : st.size;
      } catch {
        continue;
      }
      const sort = sortTitle(title);
      const fileFields = {
        path: hit.filePath,
        filename,
        size_bytes: size,
        platform_slug: hit.platform.slug,
        variant: hit.variant,
        disc_number: parseDiscNumber(filename),
        revision: parseRevision(filename),
        language: parseLanguages(filename, region),
      };

      const existing = existingByPath.get(hit.filePath) as
        | {
            id: number;
            filename: string;
            size_bytes: number;
            platform_slug: string;
            variant: string | null;
            disc_number: number | null;
            revision: string | null;
            language: string | null;
            missing: number;
          }
        | undefined;
      if (existing) {
        // Only touch rows that genuinely changed (size/name/variant/etc, or a
        // file that had been marked missing and is back). An unchanged re-scan
        // leaves the row alone so it isn't reported as "updated" or rewritten —
        // which is why a watcher scan that finds one new ROM no longer says it
        // "updated" every other game in the system.
        const unchanged =
          existing.missing === 0 &&
          existing.filename === fileFields.filename &&
          existing.size_bytes === fileFields.size_bytes &&
          existing.platform_slug === fileFields.platform_slug &&
          (existing.variant ?? null) === (fileFields.variant ?? null) &&
          (existing.disc_number ?? null) === (fileFields.disc_number ?? null) &&
          (existing.revision ?? null) === (fileFields.revision ?? null) &&
          (existing.language ?? null) === (fileFields.language ?? null);
        if (!unchanged) {
          // boxart_url is left NULL — GameHub never persists a live scraper URL.
          // Box art is downloaded locally by the post-scan localizer / scrape.
          // (This is the ON CONFLICT path, which doesn't touch boxart_url anyway.)
          upsert.run({ ...fileFields, title, sort_title: sort, region, boxart_url: null });
          result.updated++;
        }
        seen.add(hit.filePath);
        continue;
      }

      // No row at this path — before inserting fresh, see if this is a file we
      // already know that was renamed/moved (its old copy is gone from disk).
      let movedId: number | undefined;
      for (const c of moveCandidates.all(hit.platform.slug, size, sort) as {
        id: number;
        path: string;
      }[]) {
        if (claimedMove.has(c.id) || c.path === hit.filePath) continue;
        if (!fs.existsSync(c.path)) {
          movedId = c.id;
          break;
        }
      }
      if (movedId !== undefined) {
        moveRow.run({ ...fileFields, id: movedId });
        claimedMove.add(movedId);
        seen.add(hit.filePath);
        result.moved++;
        continue;
      }

      // boxart_url NULL — never persist a live scraper URL; the post-scan
      // localizer downloads a libretro candidate into local storage instead.
      const ins = upsert.run({ ...fileFields, title, sort_title: sort, region, boxart_url: null });
      seen.add(hit.filePath);
      result.added++;
      result.addedIds.push(Number(ins.lastInsertRowid));
      if (result.addedTitles.length < TITLE_SAMPLE_CAP) result.addedTitles.push(title);
    }

    // Mark rows whose files disappeared — only under paths actually walked
    // this scan. Mapped folders that were SKIPPED (hidden system, or not in
    // a partial scan's selection) sit inside generic roots, so their games
    // must never be treated as missing just because they weren't walked.
    const scannedMapped = new Set(mappings.map((m) => m.path.toLowerCase()));
    const skippedMapped = allMappedPaths
      .map((p) => p.toLowerCase())
      .filter((p) => !scannedMapped.has(p));
    const all = db.prepare("SELECT id, path, title FROM roms WHERE missing = 0").all() as {
      id: number;
      path: string;
      title: string;
    }[];
    const markMissing = db.prepare("UPDATE roms SET missing = 1 WHERE id = ?");
    for (const row of all) {
      const lower = row.path.toLowerCase();
      const underScanned = scannedRoots.some((r) => lower.startsWith(r.toLowerCase()));
      if (!underScanned || seen.has(row.path)) continue;
      const underSkippedMapping = skippedMapped.some((p) => lower.startsWith(p));
      if (underSkippedMapping) continue;
      markMissing.run(row.id);
      result.markedMissing++;
      if (result.removedTitles.length < TITLE_SAMPLE_CAP) result.removedTitles.push(row.title);
    }
  });
  scanAll();
  return result;
}

// ---------- auto-detect systems from a root folder ----------

export interface DetectedFolder {
  path: string;
  folder: string;
  platform_slug: string | null;
  platform_name: string | null;
  variant: string | null;
}

function matchPlatformName(rawName: string): { platform?: Platform; variant: string | null } {
  const lower = rawName.toLowerCase();
  let variant: string | null = null;
  for (const [kw, v] of Object.entries(VARIANT_KEYWORDS)) {
    if (lower.includes(kw)) {
      variant = v;
      break;
    }
  }
  // Strip variant words + noise ("roms"/"library" only — never "game",
  // which would destroy Game Boy / Game Gear / Game & Watch)
  const cleaned = lower
    .replace(/\b(roms?|library)\b/g, "")
    .replace(
      new RegExp(`\\b(${Object.keys(VARIANT_KEYWORDS).join("|")})\\b`, "g"),
      ""
    )
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let platform = platformByFolder(cleaned);
  if (!platform && cleaned) {
    // Token-subset match. Coverage-aware scoring: the alias that explains
    // the most folder tokens wins, so "super nintendo entertainment system"
    // (SNES) beats "nintendo entertainment system" (NES) for a folder named
    // "Super Nintendo Entertainment System".
    const tokens = new Set(cleaned.split(" "));
    let bestScore = -Infinity;
    for (const p of PLATFORMS) {
      for (const alias of [
        ...p.folderAliases,
        p.name.toLowerCase(),
        p.shortName.toLowerCase(),
      ]) {
        const aliasTokens = alias
          .replace(/[^a-z0-9 ]+/g, " ")
          .split(/\s+/)
          .filter(Boolean);
        if (aliasTokens.length === 0) continue;
        if (!aliasTokens.every((t) => tokens.has(t))) continue;
        // alias length dominates; unexplained folder tokens break ties
        const score = aliasTokens.length * 10 - (tokens.size - aliasTokens.length);
        if (score > bestScore) {
          bestScore = score;
          platform = p;
        }
      }
    }
  }
  return { platform, variant };
}

/**
 * Inspect a root folder's immediate subfolders and propose system mappings.
 * Variant-named subfolders nested inside a matched system folder (e.g.
 * SNES/Hacks) are proposed as paired variant libraries.
 */
export function detectSystems(root: string): { proposals: DetectedFolder[]; error?: string } {
  if (!fs.existsSync(root)) return { proposals: [], error: `Folder not found: ${root}` };
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (e) {
    return { proposals: [], error: `Cannot read folder: ${e instanceof Error ? e.message : e}` };
  }

  const proposals: DetectedFolder[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(root, entry.name);
    const { platform, variant } = matchPlatformName(entry.name);

    proposals.push({
      path: full,
      folder: entry.name,
      platform_slug: platform?.slug ?? null,
      platform_name: platform?.name ?? null,
      variant: platform ? variant : null,
    });

    // One level deeper: variant subfolders paired to a matched system
    if (platform) {
      let children: fs.Dirent[] = [];
      try {
        children = fs.readdirSync(full, { withFileTypes: true });
      } catch {}
      for (const child of children) {
        if (!child.isDirectory()) continue;
        const childVariant = VARIANT_KEYWORDS[child.name.toLowerCase()];
        if (childVariant) {
          proposals.push({
            path: path.join(full, child.name),
            folder: `${entry.name}/${child.name}`,
            platform_slug: platform.slug,
            platform_name: platform.name,
            variant: childVariant,
          });
        }
      }
    }
  }
  return { proposals };
}
