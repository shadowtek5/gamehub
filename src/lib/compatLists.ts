// Official emulator compatibility lists, matched to games:
//  - RPCS3 (PS3): rpcs3.net's compatibility export, by serial (BLUS30443).
//  - Vita3K (PS Vita): the Vita3K/compatibility database, by title id (PCSE00651).
//  - PCSX2 (PS2; also what AetherSX2 / NetherSX2 / ARMSX2 are based on): its GameIndex.yaml,
//    by serial (SLUS-20062) or, when the file name has none, by title + region.
// Downloaded at most weekly into the compat_external table; a game's serial is found once
// (file name, the game's own files, or a title match) and kept in rom_serials.

import fs from "fs";
import path from "path";
import { getDb, getSetting, setSetting } from "./db";
import { zipEntryNames } from "./vitaPfs";
import type { CompatRating } from "./db";

const REFRESHED_SETTING = "compat_lists_refreshed_at";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const SOURCES = {
  rpcs3: "https://rpcs3.net/compatibility?api=v1&export",
  vita3k: "https://github.com/Vita3K/compatibility/releases/download/compat_db/app_compat_db.xml",
  vita3kLabels: "https://api.github.com/repos/Vita3K/compatibility/labels?per_page=100",
  pcsx2: "https://raw.githubusercontent.com/PCSX2/pcsx2/master/bin/resources/GameIndex.yaml",
};

/** Which list covers which GameHub system. */
const LIST_FOR: Record<string, { source: string; emulator: string }> = {
  ps3: { source: "rpcs3", emulator: "RPCS3" },
  vita: { source: "vita3k", emulator: "Vita3K" },
  ps2: { source: "pcsx2", emulator: "PCSX2 · AetherSX2 · NetherSX2" },
};

export interface ExternalCompat {
  source: string;
  emulator: string;
  /** the list's own wording: Playable, Ingame +, Intro… */
  status: string;
  rating: CompatRating;
  serial: string;
  link: string | null;
  updated: string | null;
}

/** "SLUS-20062" / "SLES_123.45" / "blus30443" → "SLUS20062" / "SLES12345" / "BLUS30443". */
export function normSerial(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normTitle(s: string): string {
  let t = s.toLowerCase().replace(/\s*[([][^)\]]*[)\]]/g, "").trim();
  if (t.endsWith(", the")) t = t.slice(0, -5);
  t = t.replace(/^the\s+/, "");
  return t.replace(/[^a-z0-9]/g, "");
}

// ---------- downloading the lists ----------

const RPCS3_RATING: Record<string, CompatRating> = { Playable: "playable", Ingame: "runs", Intro: "broken", Loadable: "broken", Nothing: "broken" };
const VITA3K_ORDER = ["Playable", "Ingame +", "Ingame -", "Menu", "Intro", "Bootable", "Nothing"];
const VITA3K_RATING: Record<string, CompatRating> = {
  Playable: "playable", "Ingame +": "runs", "Ingame -": "runs", Menu: "broken", Intro: "broken", Bootable: "broken", Nothing: "broken",
};
/** Known label ids, in case GitHub's API is rate limited. */
const VITA3K_LABELS: Record<string, string> = {
  "1260231569": "Nothing", "1344750319": "Bootable", "1260231381": "Intro", "1344751053": "Menu",
  "1344752299": "Ingame -", "1260231985": "Ingame +",
};
const PCSX2_STATUS = ["Unknown", "Nothing", "Intro", "Menus", "In-game", "Playable", "Perfect"];
const PCSX2_RATING = (n: number): CompatRating | null => (n >= 5 ? "playable" : n === 4 ? "runs" : n >= 1 ? "broken" : null);

const PCSX2_REGION: Record<string, string> = { "NTSC-U": "usa", PAL: "europe", "NTSC-J": "japan", "NTSC-K": "korea", "NTSC-C": "china" };

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000), headers: { "User-Agent": "GameHub" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

interface Row {
  key: string;
  status: string;
  rating: CompatRating;
  title_norm: string | null;
  region: string | null;
  updated: string | null;
  link: string | null;
}

async function loadRpcs3(): Promise<Row[]> {
  const data = JSON.parse(await fetchText(SOURCES.rpcs3)) as { results?: Record<string, { status: string; date?: string }> };
  return Object.entries(data.results ?? {}).flatMap(([serial, v]) => {
    const rating = RPCS3_RATING[v.status];
    return rating
      ? [{ key: normSerial(serial), status: v.status, rating, title_norm: null, region: null, updated: v.date ?? null, link: `https://rpcs3.net/compatibility?g=${serial}` }]
      : [];
  });
}

async function loadVita3k(): Promise<Row[]> {
  const labels: Record<string, string> = { ...VITA3K_LABELS };
  try {
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(`${SOURCES.vita3kLabels}&page=${page}`, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "GameHub" } });
      if (!res.ok) break;
      const list = (await res.json()) as { id: number; name: string }[];
      for (const l of list) labels[String(l.id)] = l.name;
      if (list.length < 100) break;
    }
  } catch {
    /* keep the known ids */
  }
  const xml = await fetchText(SOURCES.vita3k);
  const out: Row[] = [];
  for (const m of xml.matchAll(/<app title_id="([A-Z0-9]+)">([\s\S]*?)<\/app>/g)) {
    const body = m[2];
    const names = [...body.matchAll(/<label>(\d+)<\/label>/g)].map((x) => labels[x[1]]).filter(Boolean);
    const status = VITA3K_ORDER.find((s) => names.includes(s));
    if (!status) continue;
    const issue = /<issue_id>(\d+)<\/issue_id>/.exec(body)?.[1];
    const updated = /<updated_at>(\d+)<\/updated_at>/.exec(body)?.[1];
    out.push({
      key: normSerial(m[1]),
      status,
      rating: VITA3K_RATING[status],
      title_norm: null,
      region: null,
      updated: updated ? new Date(Number(updated) * 1000).toISOString().slice(0, 10) : null,
      link: issue ? `https://github.com/Vita3K/compatibility/issues/${issue}` : null,
    });
  }
  return out;
}

async function loadPcsx2(): Promise<Row[]> {
  const out: Row[] = [];
  let cur: { serial: string; name?: string; nameEn?: string; region?: string; compat?: number } | null = null;
  const flush = () => {
    if (!cur || cur.compat === undefined) return;
    const rating = PCSX2_RATING(cur.compat);
    if (!rating) return;
    const title = cur.nameEn ?? cur.name;
    out.push({
      key: normSerial(cur.serial),
      status: PCSX2_STATUS[cur.compat] ?? String(cur.compat),
      rating,
      title_norm: title ? normTitle(title) : null,
      region: cur.region ? PCSX2_REGION[cur.region] ?? null : null,
      updated: null,
      link: null,
    });
  };
  for (const line of (await fetchText(SOURCES.pcsx2)).split(/\r?\n/)) {
    const top = /^([A-Z]{4}-\d{5}):\s*$/.exec(line);
    if (top) {
      flush();
      cur = { serial: top[1] };
      continue;
    }
    if (!cur) continue;
    const kv = /^ {2}(name|name-en|region|compat):\s*"?(.*?)"?\s*$/.exec(line);
    if (!kv) continue;
    if (kv[1] === "name") cur.name = kv[2];
    else if (kv[1] === "name-en") cur.nameEn = kv[2];
    else if (kv[1] === "region") cur.region = kv[2];
    else cur.compat = Number(kv[2]);
  }
  flush();
  return out;
}

let refreshing: Promise<void> | null = null;

/** Downloads every list again (each source independently; a failed one keeps its old rows). */
export function refreshCompatLists(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const db = getDb();
    const insert = db.prepare(
      `INSERT OR REPLACE INTO compat_external (source, key, status, rating, title_norm, region, updated, link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const [source, load] of [["rpcs3", loadRpcs3], ["vita3k", loadVita3k], ["pcsx2", loadPcsx2]] as const) {
      try {
        const rows = await load();
        if (!rows.length) continue;
        db.transaction(() => {
          db.prepare("DELETE FROM compat_external WHERE source = ?").run(source);
          for (const r of rows) insert.run(source, r.key, r.status, r.rating, r.title_norm, r.region, r.updated, r.link);
        })();
      } catch (e) {
        console.warn(`[compat] ${source} list:`, (e as Error).message);
      }
    }
    setSetting(REFRESHED_SETTING, new Date().toISOString());
    // Title matches may change with a new list; serials found from files stay.
    db.prepare("DELETE FROM rom_serials WHERE serial = ''").run();
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Makes sure the lists are there: downloads them the first time, refreshes weekly in the background. */
async function ensureLists(): Promise<void> {
  const at = getSetting(REFRESHED_SETTING);
  if (!at) return refreshCompatLists();
  if (Date.now() - Date.parse(at) > MAX_AGE_MS) void refreshCompatLists();
}

export function compatListsRefreshedAt(): string | null {
  return getSetting(REFRESHED_SETTING);
}

// ---------- finding a game's serial ----------

const SERIAL_IN_NAME: Record<string, RegExp> = {
  ps2: /(?<![A-Z0-9])(S[CLRT][A-Z]{2}|PBP[XA]|PAP[XY]|SCAJ|TCPS|ALCH|CPCS|PCPX|SCKA|SCPS)[-_ ]?(\d{3})\.?(\d{2})(?!\d)/i,
  ps3: /(?<![A-Z0-9])((?:B[CL][AEJKU][SDMBT])|(?:NP[AEHJKU][A-Z]))[-_ ]?(\d{5})(?!\d)/i,
  vita: /(?<![A-Z0-9])(PCS[A-Z])[-_ ]?(\d{5})(?!\d)/i,
};

/** A PS3 game kept as a folder: TITLE_ID from its PARAM.SFO. */
function ps3FolderSerial(dir: string): string | null {
  for (const rel of ["PS3_GAME/PARAM.SFO", "PARAM.SFO"]) {
    try {
      const buf = fs.readFileSync(path.join(dir, rel));
      const s = sfoString(buf, "TITLE_ID");
      if (s) return s;
    } catch {
      /* not there */
    }
  }
  return null;
}

/** Reads a string value from a PlayStation param.sfo. */
function sfoString(b: Buffer, wanted: string): string | null {
  if (b.length < 20 || b.toString("latin1", 1, 4) !== "PSF") return null;
  const keyTable = b.readUInt32LE(8);
  const dataTable = b.readUInt32LE(12);
  const count = b.readUInt32LE(16);
  for (let i = 0; i < count; i++) {
    const e = 20 + i * 16;
    if (e + 16 > b.length) break;
    const keyOff = b.readUInt16LE(e);
    const len = b.readUInt32LE(e + 4);
    const dataOff = b.readUInt32LE(e + 12);
    const k = keyTable + keyOff;
    const end = b.indexOf(0, k);
    if (b.toString("latin1", k, end) === wanted) {
      return b.toString("utf8", dataTable + dataOff, dataTable + dataOff + len).replace(/\0+$/, "").trim() || null;
    }
  }
  return null;
}

interface RomLite {
  id: number;
  title: string;
  path: string;
  filename: string;
  platform_slug: string;
  region: string | null;
}

/** The game's serial for its system's list, found once and remembered ('' = none found). */
async function serialFor(rom: RomLite): Promise<string> {
  const db = getDb();
  const known = db.prepare("SELECT serial FROM rom_serials WHERE rom_id = ?").get(rom.id) as { serial: string } | undefined;
  if (known) return known.serial;

  let serial = "";
  const re = SERIAL_IN_NAME[rom.platform_slug];
  const m = re?.exec(rom.path) ?? re?.exec(rom.title);
  if (m) serial = normSerial(m.slice(1).join(""));
  if (!serial && rom.platform_slug === "ps3") {
    try {
      if (fs.statSync(rom.path).isDirectory()) serial = normSerial(ps3FolderSerial(rom.path) ?? "");
    } catch {
      /* missing */
    }
  }
  if (!serial && rom.platform_slug === "vita" && /\.zip$/i.test(rom.path)) {
    try {
      const names = await zipEntryNames(rom.path);
      const hit = names.map((n) => /(?:^|\/)(?:app|patch)\/(PCS[A-Z]\d{5})\//i.exec(n)?.[1]).find(Boolean);
      if (hit) serial = normSerial(hit);
    } catch {
      /* unreadable */
    }
  }
  if (!serial && rom.platform_slug === "ps2") {
    // PCSX2's index has names: match the title, preferring the same region.
    const rows = db
      .prepare("SELECT key, region FROM compat_external WHERE source = 'pcsx2' AND title_norm = ?")
      .all(normTitle(rom.title)) as { key: string; region: string | null }[];
    const region = (rom.region ?? "").toLowerCase();
    serial = (rows.find((r) => r.region && region.includes(r.region)) ?? rows[0])?.key ?? "";
  }
  db.prepare("INSERT OR REPLACE INTO rom_serials (rom_id, serial) VALUES (?, ?)").run(rom.id, serial);
  return serial;
}

/** What the official list for this game's system says about it, if it's on one. */
export async function externalCompatFor(romId: number): Promise<ExternalCompat[]> {
  const db = getDb();
  const rom = db
    .prepare("SELECT id, title, path, filename, platform_slug, region FROM roms WHERE id = ?")
    .get(romId) as RomLite | undefined;
  const list = rom ? LIST_FOR[rom.platform_slug] : undefined;
  if (!rom || !list) return [];
  await ensureLists();
  const serial = await serialFor(rom);
  if (!serial) return [];
  const row = db
    .prepare("SELECT status, rating, link, updated FROM compat_external WHERE source = ? AND key = ?")
    .get(list.source, serial) as { status: string; rating: CompatRating; link: string | null; updated: string | null } | undefined;
  if (!row) return [];
  return [{ source: list.source, emulator: list.emulator, serial, ...row }];
}
