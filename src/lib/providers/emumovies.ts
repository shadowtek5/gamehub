// EmuMovies media over FTP (ftp.emumovies.com) — available to EmuMovies
// supporters. Their HTTP API is invite-only, but FTP is the documented way
// frontends (HyperSpin etc.) sync media. Folder names vary, so system and
// media folders are matched fuzzily and listings are cached per process.

import { Client, FileInfo } from "basic-ftp";
import fs from "fs";
import path from "path";
import { Platform } from "../platforms";
import { EmuMoviesConfig } from "./config";

// USA/primary first, European clone as fallback. Plain FTP, port 21.
const HOSTS = ["files.emumovies.com", "files2.emumovies.com"];

/** Extra name hints per platform slug for matching EmuMovies system folders */
const EM_HINTS: Record<string, string[]> = {
  nes: ["nintendo nes", "nintendo entertainment system"],
  snes: ["nintendo snes", "super nintendo entertainment system"],
  n64: ["nintendo 64", "nintendo n64"],
  gb: ["nintendo game boy"],
  gbc: ["nintendo game boy color"],
  gba: ["nintendo game boy advance"],
  nds: ["nintendo ds"],
  genesis: ["sega genesis", "sega mega drive"],
  sms: ["sega master system"],
  gg: ["sega game gear"],
  psx: ["sony playstation", "sony psx"],
  atari2600: ["atari 2600"],
  pce: ["nec turbografx-16", "nec pc engine", "turbografx 16"],
};

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean)
  );
}

function tokenScore(a: Set<string>, b: Set<string>): number {
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  // Penalize unmatched tokens on either side so "Nintendo Entertainment
  // System" prefers its own folder over "Super Nintendo Entertainment System"
  return hit / Math.max(1, Math.max(a.size, b.size));
}

function normalizeGameName(s: string): string {
  return s
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

// ---------- process-level listing cache ----------
const globalCache = globalThis as unknown as {
  __emCache?: Map<string, FileInfo[]>;
};
function cache(): Map<string, FileInfo[]> {
  if (!globalCache.__emCache) globalCache.__emCache = new Map();
  return globalCache.__emCache;
}

async function listCached(client: Client, path: string): Promise<FileInfo[]> {
  const hit = cache().get(path);
  if (hit) return hit;
  const list = await client.list(path);
  cache().set(path, list);
  return list;
}

export async function emConnect(config: EmuMoviesConfig): Promise<Client> {
  let lastError: unknown;
  for (const host of HOSTS) {
    const client = new Client(25_000);
    try {
      await client.access({
        host,
        user: config.username,
        password: config.password,
      });
      return client;
    } catch (e) {
      client.close();
      lastError = e;
      // Auth rejections are account-side — trying the clone won't help
      if (e instanceof Error && e.message.includes("530")) throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function emTest(
  config: EmuMoviesConfig
): Promise<{ ok: boolean; message: string; folders?: string[] }> {
  let client: Client | undefined;
  try {
    client = await emConnect(config);
    const root = await client.list("/");
    const folders = root.filter((f) => f.isDirectory).map((f) => f.name);
    return {
      ok: true,
      message: `Connected — ${folders.length} folders visible`,
      folders: folders.slice(0, 40),
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw.includes("530")) {
      return {
        ok: false,
        message:
          "Login rejected (530). Use your EmuMovies forum username (not email) and site password — and note FTP access requires a paid EmuMovies supporter subscription; free accounts are refused here even with correct credentials.",
      };
    }
    if (/timeout|ENOTFOUND|ECONNREFUSED/i.test(raw)) {
      return {
        ok: false,
        message: `Cannot reach files.emumovies.com or files2.emumovies.com (${raw}) — check your firewall allows outbound FTP (port 21 + passive ports).`,
      };
    }
    return { ok: false, message: raw };
  } finally {
    client?.close();
  }
}

/**
 * Rank tied system folders: retail No-Intro sets first, curated lists next,
 * hack/homebrew/MSU1 variants last (a game is searched in each until found).
 */
function setRank(name: string): number {
  const n = name.toLowerCase();
  if (/hacks|homebrew|msu[- ]?1|translations/.test(n)) return 3;
  if (/no-intro|no intro/.test(n)) return 0;
  if (/hyperlist|redump/.test(n)) return 1;
  return 2;
}

function findSystemDirs(root: FileInfo[], platform: Platform): FileInfo[] {
  const candidates = [
    platform.name,
    platform.shortName,
    ...(EM_HINTS[platform.slug] ?? []),
    ...platform.folderAliases,
  ].map(tokens);
  const scored: { dir: FileInfo; score: number }[] = [];
  for (const dir of root.filter((f) => f.isDirectory)) {
    const dirTokens = tokens(dir.name);
    let best = 0;
    for (const cand of candidates) {
      best = Math.max(best, tokenScore(cand, dirTokens));
    }
    if (best >= 0.75) scored.push({ dir, score: best });
  }
  return scored
    .sort(
      (a, b) => b.score - a.score || setRank(a.dir.name) - setRank(b.dir.name)
    )
    .map((s) => s.dir);
}

function findGameFile(files: FileInfo[], gameName: string, filename: string): FileInfo | undefined {
  const wantA = normalizeGameName(filename);
  const wantB = normalizeGameName(gameName);
  const named = files
    .filter((f) => !f.isDirectory)
    .map((f) => ({ f, norm: normalizeGameName(f.name) }));
  return (
    named.find((x) => x.norm === wantA)?.f ??
    named.find((x) => x.norm === wantB)?.f ??
    named.find((x) => x.norm.startsWith(wantB) || wantB.startsWith(x.norm))?.f
  );
}

export interface EmMediaResult {
  video?: { remote: string; ext: string; size?: number };
  boxart?: { remote: string; ext: string };
  screenshot?: { remote: string; ext: string };
  hero?: { remote: string; ext: string };
  icon?: { remote: string; ext: string };
  manual?: { remote: string; ext: string; size?: number };
  systemDir?: string;
  error?: string;
}

// Real server layout: /Official/Video Snaps (HQ)/{System} (Video Snaps)(HQ)(EM x.y)/{Game}.mp4
// and /Official/Game Manuals/{System} (Game Manuals)(No-Intro)(EM x.y)/{Game}.pdf
// (Artwork ships as zip packs, so per-game art isn't fetchable over FTP.)
const VIDEO_BASES = [
  "/Official/Video Snaps (HQ)",
  "/Official/Video Snaps (SQ)",
  "/Official/Video Snaps (HD)",
];
const MANUAL_BASES = ["/Official/Game Manuals"];

/** Locate a game's video snap and manual (does not download; see emDownload) */
export async function emLocate(
  client: Client,
  platform: Platform,
  gameTitle: string,
  filename: string
): Promise<EmMediaResult> {
  let sawSystem = false;

  async function locate(
    bases: string[],
    fallbackExt: string
  ): Promise<{ remote: string; ext: string; size?: number; systemDir: string } | undefined> {
    for (const base of bases) {
      let root: FileInfo[];
      try {
        root = await listCached(client, base);
      } catch {
        continue;
      }
      // Multiple set variants can match (No-Intro / HyperList / Hacks) —
      // search each in preference order until the game turns up
      for (const sysDir of findSystemDirs(root, platform).slice(0, 4)) {
        sawSystem = true;
        const dirPath = `${base}/${sysDir.name}`;
        try {
          const files = await listCached(client, dirPath);
          const file = findGameFile(files, gameTitle, filename);
          if (file) {
            const ext = file.name.includes(".")
              ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase()
              : fallbackExt;
            return {
              remote: `${dirPath}/${file.name}`,
              ext,
              size: file.size,
              systemDir: sysDir.name,
            };
          }
        } catch {
          // unreadable folder — try the next candidate
        }
      }
    }
    return undefined;
  }

  const result: EmMediaResult = {};
  const video = await locate(VIDEO_BASES, "mp4");
  if (video) {
    result.video = { remote: video.remote, ext: video.ext, size: video.size };
    result.systemDir = video.systemDir;
  }
  const manual = await locate(MANUAL_BASES, "pdf");
  if (manual) {
    result.manual = { remote: manual.remote, ext: manual.ext, size: manual.size };
    result.systemDir ??= manual.systemDir;
  }
  if (!result.video && !result.manual) {
    result.error = sawSystem
      ? `No EmuMovies media for "${gameTitle}"`
      : `No EmuMovies folder matched "${platform.name}"`;
  }
  return result;
}

export async function emDownload(client: Client, remote: string, localPath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  await client.downloadTo(localPath, remote);
}

// Keep a short-lived shared connection for bulk scraping
const globalConn = globalThis as unknown as {
  __emConn?: { client: Client; usedAt: number };
};

export async function emSharedClient(config: EmuMoviesConfig): Promise<Client> {
  const now = Date.now();
  const existing = globalConn.__emConn;
  if (existing && now - existing.usedAt < 30_000 && !existing.client.closed) {
    existing.usedAt = now;
    return existing.client;
  }
  existing?.client.close();
  const client = await emConnect(config);
  globalConn.__emConn = { client, usedAt: now };
  return client;
}
