// LaunchBox Games Database — no per-game API; their whole DB ships as
// Metadata.zip (~500MB, one huge XML). We download it once, stream-parse it
// into a local SQLite file, then scrape lookups are instant local queries.
// Images come from images.launchbox-app.com by filename.

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import yauzl from "yauzl";
import { Platform, platformBySlug } from "../platforms";
import { MediaRefs } from "./config";
import { getDataDir } from "../dataDir";

const METADATA_URL = "https://gamesdb.launchbox-app.com/Metadata.zip";
const IMAGE_BASE = "https://images.launchbox-app.com/";

// ---------- local database ----------

const globalLb = globalThis as unknown as {
  __lbDb?: Database.Database;
  __lbCount?: { value: number; at: number };
  __lbImport?: LbImportStatus;
};

function lbDb(): Database.Database {
  if (!globalLb.__lbDb) {
    const dir = getDataDir();
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, "launchbox.db"));
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        name_norm TEXT NOT NULL,
        platform TEXT NOT NULL,
        overview TEXT,
        developer TEXT,
        publisher TEXT,
        genres TEXT,
        players TEXT,
        rating TEXT,
        release_date TEXT,
        esrb TEXT,
        cooperative INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_lb_games ON games(platform, name_norm);
      CREATE TABLE IF NOT EXISTS images (
        game_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        region TEXT,
        filename TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lb_images ON images(game_id);
      CREATE TABLE IF NOT EXISTS platforms (
        name TEXT PRIMARY KEY,
        name_norm TEXT NOT NULL,
        manufacturer TEXT,
        developer TEXT,
        release_date TEXT,
        category TEXT,
        media TEXT,
        notes TEXT
      );
      CREATE TABLE IF NOT EXISTS platform_images (
        platform TEXT NOT NULL,
        type TEXT NOT NULL,
        region TEXT,
        filename TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lb_platform_images ON platform_images(platform);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    // Columns added after the table first shipped — safe on existing imports.
    for (const [col, ddl] of [
      ["esrb", "TEXT"],
      ["cooperative", "INTEGER"],
    ]) {
      try {
        db.exec(`ALTER TABLE games ADD COLUMN ${col} ${ddl}`);
      } catch {
        // column already exists
      }
    }
    globalLb.__lbDb = db;
  }
  return globalLb.__lbDb;
}

/** Imported and non-empty? Cached briefly — checked once per scraped game. */
export function launchboxConfigured(): boolean {
  const now = Date.now();
  if (!globalLb.__lbCount || now - globalLb.__lbCount.at > 60_000) {
    try {
      const c = (lbDb().prepare("SELECT COUNT(*) c FROM games").get() as { c: number }).c;
      globalLb.__lbCount = { value: c, at: now };
    } catch {
      globalLb.__lbCount = { value: 0, at: now };
    }
  }
  return globalLb.__lbCount.value > 0;
}

export function lbStatus(): {
  games: number;
  images: number;
  platforms: number;
  importedAt: string | null;
} {
  try {
    const db = lbDb();
    const games = (db.prepare("SELECT COUNT(*) c FROM games").get() as { c: number }).c;
    const images = (db.prepare("SELECT COUNT(*) c FROM images").get() as { c: number }).c;
    // platforms table may be missing on DBs imported before this feature
    let platforms = 0;
    try {
      platforms = (db.prepare("SELECT COUNT(*) c FROM platforms").get() as { c: number }).c;
    } catch {}
    const importedAt =
      (db.prepare("SELECT value FROM meta WHERE key = 'imported_at'").get() as
        | { value: string }
        | undefined)?.value ?? null;
    return { games, images, platforms, importedAt };
  } catch {
    return { games: 0, images: 0, platforms: 0, importedAt: null };
  }
}

// ---------- import job ----------

export interface LbImportStatus {
  running: boolean;
  phase: "idle" | "downloading" | "importing" | "done" | "error";
  bytes: number;
  totalBytes: number;
  games: number;
  images: number;
  platforms: number;
  error?: string;
}

export function getLbImportStatus(): LbImportStatus {
  return (
    globalLb.__lbImport ?? {
      running: false,
      phase: "idle",
      bytes: 0,
      totalBytes: 0,
      games: 0,
      images: 0,
      platforms: 0,
    }
  );
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function tag(el: string, name: string): string | undefined {
  const m = el.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1]).trim() || undefined : undefined;
}

export function lbNormalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Kick off the download + import in the background. False if already running. */
export function startLbImport(): boolean {
  const s = getLbImportStatus();
  if (s.running) return false;
  const status: LbImportStatus = {
    running: true,
    phase: "downloading",
    bytes: 0,
    totalBytes: 0,
    games: 0,
    images: 0,
    platforms: 0,
  };
  globalLb.__lbImport = status;

  void (async () => {
    const zipPath = path.join(getDataDir(), "launchbox-metadata.zip");
    try {
      // ---- download with byte progress ----
      const res = await fetch(METADATA_URL, { signal: AbortSignal.timeout(3_600_000) });
      if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
      status.totalBytes = Number(res.headers.get("content-length")) || 0;
      await new Promise<void>((resolve, reject) => {
        const file = fs.createWriteStream(zipPath);
        const stream = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
        stream.on("data", (chunk: Buffer) => {
          status.bytes += chunk.length;
        });
        stream.pipe(file);
        file.on("finish", resolve);
        file.on("error", reject);
        stream.on("error", reject);
      });

      // ---- stream-parse Metadata.xml out of the zip into SQLite ----
      status.phase = "importing";
      const db = lbDb();
      db.exec("DELETE FROM games; DELETE FROM images; DELETE FROM platforms; DELETE FROM platform_images;");
      const insGame = db.prepare(
        `INSERT OR REPLACE INTO games (id, name, name_norm, platform, overview, developer, publisher, genres, players, rating, release_date, esrb, cooperative)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insImage = db.prepare(
        "INSERT INTO images (game_id, type, region, filename) VALUES (?, ?, ?, ?)"
      );
      const insPlatform = db.prepare(
        `INSERT OR REPLACE INTO platforms (name, name_norm, manufacturer, developer, release_date, category, media, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insPlatformImage = db.prepare(
        "INSERT INTO platform_images (platform, type, region, filename) VALUES (?, ?, ?, ?)"
      );

      let pending: (() => void)[] = [];
      const flush = db.transaction(() => {
        for (const fn of pending) fn();
        pending = [];
      });

      function handleElement(name: string, el: string) {
        if (name === "Game") {
          const id = Number(tag(el, "DatabaseID"));
          const title = tag(el, "Name");
          const platform = tag(el, "Platform");
          if (!Number.isFinite(id) || !title || !platform) return;
          const rating = tag(el, "CommunityRating");
          const coop = tag(el, "Cooperative");
          pending.push(() =>
            insGame.run(
              id,
              title,
              lbNormalize(title),
              platform,
              tag(el, "Overview") ?? null,
              tag(el, "Developer") ?? null,
              tag(el, "Publisher") ?? null,
              tag(el, "Genres")?.replace(/;\s*/g, ", ") ?? null,
              tag(el, "MaxPlayers") ?? null,
              rating ? `${Math.round(Number(rating) * 10) / 10}/5` : null,
              tag(el, "ReleaseDate")?.slice(0, 10) ?? tag(el, "ReleaseYear") ?? null,
              tag(el, "ESRB") ?? null,
              coop ? (/^true$/i.test(coop) ? 1 : 0) : null
            )
          );
          status.games++;
        } else if (name === "GameImage") {
          const gameId = Number(tag(el, "DatabaseID"));
          const filename = tag(el, "FileName");
          const type = tag(el, "Type");
          if (!Number.isFinite(gameId) || !filename || !type) return;
          pending.push(() => insImage.run(gameId, type, tag(el, "Region") ?? null, filename));
          status.images++;
        } else if (name === "Platform") {
          const pname = tag(el, "Name");
          if (!pname) return;
          pending.push(() =>
            insPlatform.run(
              pname,
              lbNormalize(pname),
              tag(el, "Manufacturer") ?? null,
              tag(el, "Developer") ?? null,
              tag(el, "ReleaseDate")?.slice(0, 10) ?? null,
              tag(el, "Category") ?? null,
              tag(el, "Media") ?? null,
              tag(el, "Notes") ?? null
            )
          );
          status.platforms++;
        } else if (name === "PlatformImage") {
          const platform = tag(el, "Platform");
          const filename = tag(el, "FileName");
          const type = tag(el, "Type");
          if (!platform || !filename || !type) return;
          pending.push(() => insPlatformImage.run(platform, type, tag(el, "Region") ?? null, filename));
        }
        if (pending.length >= 2000) flush();
      }

      await new Promise<void>((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
          if (err || !zip) return reject(err ?? new Error("Bad zip"));
          let found = false;
          zip.on("entry", (entry: yauzl.Entry) => {
            if (!/metadata\.xml$/i.test(entry.fileName)) {
              zip.readEntry();
              return;
            }
            found = true;
            zip.openReadStream(entry, (err2, rs) => {
              if (err2 || !rs) return reject(err2 ?? new Error("Bad entry"));
              rs.setEncoding("utf8");
              let buf = "";
              rs.on("data", (chunk: string) => {
                buf += chunk;
                // Pull out every complete top-level element in the buffer
                for (;;) {
                  const open = buf.match(/<(GameImage|Game|PlatformImage|Platform)>/);
                  if (!open) {
                    // Nothing useful before any partial tag — keep the tail only
                    if (buf.length > 1_000_000) buf = buf.slice(-100_000);
                    break;
                  }
                  const name = open[1];
                  const closeTag = `</${name}>`;
                  const end = buf.indexOf(closeTag, open.index!);
                  if (end === -1) {
                    buf = buf.slice(open.index!);
                    break;
                  }
                  handleElement(name, buf.slice(open.index! + name.length + 2, end));
                  buf = buf.slice(end + closeTag.length);
                }
              });
              rs.on("end", () => {
                zip.close();
                resolve();
              });
              rs.on("error", reject);
            });
          });
          zip.on("end", () => {
            if (!found) reject(new Error("Metadata.xml not found in the zip"));
          });
          zip.on("error", reject);
          zip.readEntry();
        });
      });

      flush();
      db.prepare(
        "INSERT INTO meta (key, value) VALUES ('imported_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).run(new Date().toISOString());
      globalLb.__lbCount = undefined;
      status.phase = "done";
    } catch (e) {
      status.phase = "error";
      status.error = e instanceof Error ? e.message : String(e);
    } finally {
      status.running = false;
      try {
        fs.rmSync(zipPath, { force: true });
      } catch {}
    }
  })();

  return true;
}

// ---------- lookups ----------

/** GameHub slug -> LaunchBox platform name, where they differ from our names */
const LB_PLATFORM_NAMES: Record<string, string> = {
  nes: "Nintendo Entertainment System",
  famicom: "Nintendo Entertainment System",
  fds: "Nintendo Famicom Disk System",
  snes: "Super Nintendo Entertainment System",
  superfamicom: "Super Nintendo Entertainment System",
  n64: "Nintendo 64",
  gamecube: "Nintendo GameCube",
  wii: "Nintendo Wii",
  wiiu: "Nintendo Wii U",
  switch: "Nintendo Switch",
  gb: "Nintendo Game Boy",
  gbc: "Nintendo Game Boy Color",
  gba: "Nintendo Game Boy Advance",
  nds: "Nintendo DS",
  "3ds": "Nintendo 3DS",
  vb: "Nintendo Virtual Boy",
  gandw: "Nintendo Game & Watch",
  genesis: "Sega Genesis",
  megadrive: "Sega Genesis",
  segacd: "Sega CD",
  megacd: "Sega CD",
  sega32x: "Sega 32X",
  saturn: "Sega Saturn",
  dreamcast: "Sega Dreamcast",
  sms: "Sega Master System",
  mark3: "Sega Master System",
  gg: "Sega Game Gear",
  sg1000: "Sega SG-1000",
  psx: "Sony Playstation",
  ps2: "Sony Playstation 2",
  ps3: "Sony Playstation 3",
  psp: "Sony PSP",
  vita: "Sony Playstation Vita",
  xbox: "Microsoft Xbox",
  xbox360: "Microsoft Xbox 360",
  atari2600: "Atari 2600",
  atari5200: "Atari 5200",
  atari7800: "Atari 7800",
  lynx: "Atari Lynx",
  jaguar: "Atari Jaguar",
  jaguarcd: "Atari Jaguar CD",
  atari800: "Atari 800",
  pce: "NEC TurboGrafx-16",
  pcengine: "NEC TurboGrafx-16",
  pcecd: "NEC TurboGrafx-CD",
  pcenginecd: "NEC TurboGrafx-CD",
  supergrafx: "PC Engine SuperGrafx",
  pcfx: "NEC PC-FX",
  neogeo: "SNK Neo Geo AES",
  ngp: "SNK Neo Geo Pocket",
  ngpc: "SNK Neo Geo Pocket Color",
  wonderswan: "WonderSwan",
  wonderswancolor: "WonderSwan Color",
  "3do": "3DO Interactive Multiplayer",
  cdi: "Philips CD-i",
  coleco: "ColecoVision",
  intellivision: "Mattel Intellivision",
  vectrex: "GCE Vectrex",
  odyssey2: "Magnavox Odyssey 2",
  channelf: "Fairchild Channel F",
  msx: "Microsoft MSX",
  msx2: "Microsoft MSX2",
  c64: "Commodore 64",
  amiga: "Commodore Amiga",
  vic20: "Commodore VIC-20",
  dos: "MS-DOS",
  appleii: "Apple II",
  acpc: "Amstrad CPC",
  zxspectrum: "Sinclair ZX Spectrum",
  arcade: "Arcade",
};

const REGION_PREF = ["North America", "United States", "World", "Europe", "Japan"];

interface LbGameRow {
  id: number;
  name: string;
  overview: string | null;
  developer: string | null;
  publisher: string | null;
  genres: string | null;
  players: string | null;
  rating: string | null;
  release_date: string | null;
  esrb: string | null;
  cooperative: number | null;
}

export interface LbResult {
  game: {
    description?: string;
    developer?: string;
    publisher?: string;
    genre?: string;
    players?: string;
    rating?: string;
    releaseDate?: string;
    ageRating?: string;
    gameModes?: string;
  };
  media: MediaRefs;
}

const IMAGE_TYPES: [keyof LbResult["media"], string[]][] = [
  ["boxart", ["Box - Front", "Box - Front - Reconstructed", "Fanart - Box - Front"]],
  ["screenshot", ["Screenshot - Gameplay", "Screenshot - Game Title"]],
  ["hero", ["Fanart - Background", "Banner", "Steam Banner"]],
  ["logo", ["Clear Logo"]],
  ["icon", ["Clear Logo"]],
];

/** LaunchBox ESRB values look like "E - Everyone" / "T - Teen" / "Not Rated". */
function lbEsrb(v: string | null): string | undefined {
  if (!v) return undefined;
  const code = v.split(" - ")[0].trim();
  if (!code || /not\s*rated|pending|unknown/i.test(code)) return undefined;
  return `ESRB: ${code}`;
}

/** Derive coarse game modes from MaxPlayers + the Cooperative flag. */
function lbModes(players: string | null, coop: number | null): string | undefined {
  const modes: string[] = [];
  const max = players ? parseInt(players, 10) : NaN;
  if (Number.isFinite(max) && max > 1) modes.push("Multiplayer");
  if (coop) modes.push("Co-operative");
  return modes.length ? modes.join(", ") : undefined;
}

function buildResult(row: LbGameRow): LbResult {
  const images = lbDb()
    .prepare("SELECT type, region, filename FROM images WHERE game_id = ?")
    .all(row.id) as { type: string; region: string | null; filename: string }[];

  const media: LbResult["media"] = {};
  for (const [key, types] of IMAGE_TYPES) {
    outer: for (const t of types) {
      const list = images.filter((i) => i.type === t);
      if (!list.length) continue;
      for (const pref of REGION_PREF) {
        const hit = list.find((i) => i.region === pref);
        if (hit) {
          media[key] = { url: IMAGE_BASE + hit.filename, format: ext(hit.filename) };
          break outer;
        }
      }
      media[key] = { url: IMAGE_BASE + list[0].filename, format: ext(list[0].filename) };
      break;
    }
  }
  return {
    game: {
      description: row.overview ?? undefined,
      developer: row.developer ?? undefined,
      publisher: row.publisher ?? undefined,
      genre: row.genres ?? undefined,
      players: row.players ?? undefined,
      rating: row.rating ?? undefined,
      releaseDate: row.release_date ?? undefined,
      ageRating: lbEsrb(row.esrb),
      gameModes: lbModes(row.players, row.cooperative),
    },
    media,
  };
}

function ext(filename: string): string {
  return filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "png";
}

export function lbLookup(title: string, platform: Platform): LbResult | null {
  if (!launchboxConfigured()) return null;
  const lbPlatform = LB_PLATFORM_NAMES[platform.slug] ?? platform.name;
  const norm = lbNormalize(title);
  if (!norm) return null;
  const db = lbDb();
  const row =
    (db
      .prepare("SELECT * FROM games WHERE platform = ? AND name_norm = ? LIMIT 1")
      .get(lbPlatform, norm) as LbGameRow | undefined) ??
    (db
      .prepare(
        "SELECT * FROM games WHERE platform = ? AND name_norm LIKE ? ORDER BY LENGTH(name_norm) LIMIT 1"
      )
      .get(lbPlatform, `${norm}%`) as LbGameRow | undefined);
  return row ? buildResult(row) : null;
}

export function lbLookupById(id: number): LbResult | null {
  const row = lbDb().prepare("SELECT * FROM games WHERE id = ?").get(id) as
    | LbGameRow
    | undefined;
  return row ? buildResult(row) : null;
}

export interface LbSearchHit {
  id: number;
  title: string;
  system?: string;
  year?: string;
}

// ---------- system / platform lookups ----------

/** GameHub slug -> the LaunchBox platform name to look up. */
function lbPlatformName(slug: string): string {
  return LB_PLATFORM_NAMES[slug] ?? platformBySlug(slug)?.name ?? slug;
}

export interface LbPlatformMeta {
  manufacturer?: string;
  developer?: string;
  /** LaunchBox "Category" — Console, Handheld, Computer, Arcade… */
  systemType?: string;
  yearStart?: string;
  mediaFormat?: string;
  notes?: string;
}

/** Console metadata for a GameHub system from the imported LaunchBox DB. */
export function lbPlatformMeta(slug: string): LbPlatformMeta | null {
  if (!launchboxConfigured()) return null;
  try {
    const row = lbDb()
      .prepare("SELECT * FROM platforms WHERE name = ?")
      .get(lbPlatformName(slug)) as
      | {
          manufacturer: string | null;
          developer: string | null;
          release_date: string | null;
          category: string | null;
          media: string | null;
          notes: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      manufacturer: row.manufacturer ?? undefined,
      developer: row.developer ?? undefined,
      systemType: row.category ?? undefined,
      yearStart: row.release_date?.slice(0, 4) ?? undefined,
      mediaFormat: row.media ?? undefined,
      notes: row.notes ?? undefined,
    };
  } catch {
    // platforms table not present yet (imported before this feature) — re-import
    return null;
  }
}

// LaunchBox platform image type → GameHub system art kind
const LB_PLATFORM_ART: Record<"hero" | "logo" | "icon" | "ribbon", string[]> = {
  hero: ["Fanart - Background", "Banner"],
  ribbon: ["Banner", "Fanart - Background"],
  logo: ["Clear Logo"],
  icon: ["Device", "Clear Logo"],
};

export interface LbPlatformArt {
  url: string;
  type: string;
}

/** Platform art candidates of one kind for a GameHub system (imported LB DB). */
export function lbPlatformArtCandidates(
  slug: string,
  kind: "hero" | "logo" | "icon" | "ribbon"
): LbPlatformArt[] {
  if (!launchboxConfigured()) return [];
  try {
    const rows = lbDb()
      .prepare("SELECT type, region, filename FROM platform_images WHERE platform = ?")
      .all(lbPlatformName(slug)) as { type: string; region: string | null; filename: string }[];
    const out: LbPlatformArt[] = [];
    for (const t of LB_PLATFORM_ART[kind]) {
      for (const r of rows.filter((x) => x.type === t)) {
        out.push({ url: IMAGE_BASE + r.filename, type: r.type });
      }
    }
    return out;
  } catch {
    // platform_images table not present yet (imported before this feature)
    return [];
  }
}

export function lbSearch(query: string, platformSlug?: string): LbSearchHit[] {
  if (!launchboxConfigured()) return [];
  const db = lbDb();
  const like = `%${lbNormalize(query)}%`;
  const lbPlatform = platformSlug
    ? (LB_PLATFORM_NAMES[platformSlug] ?? platformSlug)
    : undefined;
  const rows = (
    lbPlatform
      ? db
          .prepare(
            "SELECT id, name, platform, release_date FROM games WHERE platform = ? AND name_norm LIKE ? ORDER BY LENGTH(name_norm) LIMIT 20"
          )
          .all(lbPlatform, like)
      : db
          .prepare(
            "SELECT id, name, platform, release_date FROM games WHERE name_norm LIKE ? ORDER BY LENGTH(name_norm) LIMIT 20"
          )
          .all(like)
  ) as { id: number; name: string; platform: string; release_date: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.name,
    system: r.platform,
    year: r.release_date?.slice(0, 4),
  }));
}
