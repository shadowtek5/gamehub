// AudioLoader (SDH-AudioLoader) pack support — sound packs replace the UI
// sound effects, music packs loop menu music. Packs are zips from
// deckthemes.com (filters=AUDIO.*) containing a pack.json:
//   { name, description, version, author, manifest_version,
//     music: bool, ignore: [steamFile...], mappings: {steamFile: [file...]} }
// Sound resolution mirrors AudioLoader's PlayAudioURL patch: an active pack
// path-replaces /sounds/<name> with /sounds_custom/<packDir>/<name>, unless
// the name is in `ignore` (keep default) or `mappings` (random alternative).
// Config mirrors AudioLoader's config.json: one sound pack, one music pack,
// separate volumes.

import fs from "fs";
import path from "path";
import yauzl from "yauzl";
import { getSetting, setSetting } from "./db";

const API = "https://api.deckthemes.com";
const AUDIO_DIR = path.join(process.cwd(), "data", "audio");
const MAX_ZIP_BYTES = 100 * 1024 * 1024;

export interface AudioPackMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  target: string; // Audio | Music
  music: boolean;
  ignore: string[];
  mappings: Record<string, string[]>;
  hasIntro: boolean;
  installedAt: string;
}

export interface AudioConfig {
  selected_pack: string; // pack NAME or "Default" (AudioLoader convention)
  selected_music: string; // pack NAME or "None"
  sound_volume: number; // 0..1
  music_volume: number; // 0..1
}

const DEFAULT_CONFIG: AudioConfig = {
  selected_pack: "Default",
  selected_music: "None",
  sound_volume: 1,
  music_volume: 0.5,
};

export function getAudioConfig(): AudioConfig {
  try {
    const raw = getSetting("audio_config");
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function setAudioConfig(changes: Partial<AudioConfig>): AudioConfig {
  const cur = getAudioConfig();
  const next: AudioConfig = {
    selected_pack:
      typeof changes.selected_pack === "string" ? changes.selected_pack : cur.selected_pack,
    selected_music:
      typeof changes.selected_music === "string" ? changes.selected_music : cur.selected_music,
    sound_volume: clamp01(changes.sound_volume, cur.sound_volume),
    music_volume: clamp01(changes.music_volume, cur.music_volume),
  };
  setSetting("audio_config", JSON.stringify(next));
  return next;
}

function clamp01(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

export function listAudioPacks(): AudioPackMeta[] {
  if (!fs.existsSync(AUDIO_DIR)) return [];
  const out: AudioPackMeta[] = [];
  for (const e of fs.readdirSync(AUDIO_DIR, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(AUDIO_DIR, e.name, "meta.json"), "utf8")));
    } catch {}
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The active packs + config, shaped for the client AudioManager. */
export function activeAudio() {
  const config = getAudioConfig();
  const packs = listAudioPacks();
  const sound =
    config.selected_pack !== "Default"
      ? packs.find((p) => !p.music && p.name === config.selected_pack) ?? null
      : null;
  const music =
    config.selected_music !== "None"
      ? packs.find((p) => p.music && p.name === config.selected_music) ?? null
      : null;
  return {
    config,
    sound: sound
      ? { dir: sound.id, ignore: sound.ignore, mappings: sound.mappings }
      : null,
    music: music
      ? { dir: music.id, mappings: music.mappings, hasIntro: music.hasIntro }
      : null,
  };
}

function extractZip(zipPath: string, destDir: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const written: string[] = [];
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("Bad zip"));
      zip.readEntry();
      zip.on("entry", (entry) => {
        // packs zip as <PackName>/<files> — strip the single root folder
        const parts = entry.fileName.replace(/\\/g, "/").split("/").filter(Boolean);
        const rel = (parts.length > 1 ? parts.slice(1) : parts).join("/");
        if (!rel || rel.includes("..") || entry.fileName.endsWith("/")) {
          zip.readEntry();
          return;
        }
        const dest = path.join(destDir, rel);
        if (!path.normalize(dest).startsWith(destDir)) {
          zip.readEntry();
          return;
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        zip.openReadStream(entry, (er, stream) => {
          if (er || !stream) {
            zip.readEntry();
            return;
          }
          const out = fs.createWriteStream(dest);
          stream.pipe(out);
          out.on("close", () => {
            written.push(rel);
            zip.readEntry();
          });
          out.on("error", reject);
        });
      });
      zip.on("end", () => resolve(written));
    });
  });
}

export async function installAudioPack(id: string): Promise<AudioPackMeta> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid pack id");

  const detailRes = await fetch(`${API}/themes/${id}`, { signal: AbortSignal.timeout(15000) });
  if (!detailRes.ok) throw new Error(`Pack not found (HTTP ${detailRes.status})`);
  const detail = await detailRes.json();
  if (!String(detail.type ?? detail.target ?? "").match(/audio|music/i)) {
    // deckthemes marks audio packs with target Audio/Music
    if (!["Audio", "Music"].includes(detail.target)) throw new Error("Not an audio pack");
  }
  const blobId = detail?.download?.id;
  if (!blobId) throw new Error("Pack has no download");

  const blobRes = await fetch(`${API}/blobs/${blobId}`, { signal: AbortSignal.timeout(120000) });
  if (!blobRes.ok) throw new Error(`Download failed (HTTP ${blobRes.status})`);
  const buf = Buffer.from(await blobRes.arrayBuffer());
  if (buf.length > MAX_ZIP_BYTES) throw new Error("Pack download too large");

  const dir = path.join(AUDIO_DIR, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const zipPath = path.join(dir, ".download.zip");
  fs.writeFileSync(zipPath, buf);
  await extractZip(zipPath, dir);
  fs.rmSync(zipPath, { force: true });

  let manifest: {
    name?: string;
    description?: string;
    version?: string;
    author?: string;
    music?: boolean;
    ignore?: string[];
    mappings?: Record<string, string[]>;
  } = {};
  const manifestPath = path.join(dir, "pack.json");
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {}
  }

  const music = !!manifest.music;
  const mappings = manifest.mappings ?? {};
  const meta: AudioPackMeta = {
    id,
    name: detail.displayName || detail.name || manifest.name || "Pack",
    description: manifest.description ?? "",
    version: detail.version || manifest.version || "",
    author: detail.specifiedAuthor || manifest.author || "",
    target: detail.target ?? (music ? "Music" : "Audio"),
    music,
    ignore: manifest.ignore ?? [],
    mappings,
    hasIntro:
      music &&
      ("intro_music.mp3" in mappings || fs.existsSync(path.join(dir, "intro_music.mp3"))),
    installedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  return meta;
}

export function deleteAudioPack(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid pack id");
  // if the deleted pack was selected, fall back to defaults
  const packs = listAudioPacks();
  const gone = packs.find((p) => p.id === id);
  if (gone) {
    const config = getAudioConfig();
    if (config.selected_pack === gone.name) setAudioConfig({ selected_pack: "Default" });
    if (config.selected_music === gone.name) setAudioConfig({ selected_music: "None" });
  }
  fs.rmSync(path.join(AUDIO_DIR, id), { recursive: true, force: true });
}

export async function searchAudioPacks(query: string, page = 1, filter = "", order = "Most Downloaded") {
  const filters = `AUDIO.${filter && filter !== "All" ? filter : ""}`;
  const url = `${API}/themes?filters=${encodeURIComponent(filters)}&perPage=12&page=${page}&order=${encodeURIComponent(order)}${query ? `&search=${encodeURIComponent(query)}` : ""}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`deckthemes API: HTTP ${res.status}`);
  const data = await res.json();
  const installed = new Set(listAudioPacks().map((p) => p.id));
  interface ApiTheme {
    id: string;
    displayName?: string;
    name: string;
    specifiedAuthor?: string;
    version?: string;
    target?: string;
    download?: { downloadCount?: number };
    starCount?: number;
    images?: { id: string }[];
  }
  return {
    total: data.total ?? 0,
    items: ((data.items ?? []) as ApiTheme[]).map((t) => ({
      id: t.id,
      name: t.displayName || t.name,
      author: t.specifiedAuthor ?? "",
      version: t.version ?? "",
      target: t.target ?? "",
      stars: t.starCount ?? 0,
      downloads: t.download?.downloadCount ?? 0,
      imageId: t.images?.[0]?.id ?? null,
      installed: installed.has(t.id),
    })),
  };
}
