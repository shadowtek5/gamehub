// Official emulator compatibility lists, matched to games:
//  - RPCS3 (PS3): rpcs3.net's compatibility export, by serial (BLUS30443).
//  - Vita3K (PS Vita): the Vita3K/compatibility database, by title id (PCSE00651).
//  - PCSX2 (PS2; also what AetherSX2 / NetherSX2 / ARMSX2 are based on): its GameIndex.yaml,
//    by serial (SLUS-20062) or, when the file name has none, by title + region.
//  - Azahar (3DS; the Citra family): its compatibility_list.json, by title id or title.
//  - xemu (Xbox; also X1 BOX and hakuX on Android): its public compatibility reports, by title id.
//  - Xenia Canary (Xbox 360; also aX360e on Android): its game-compatibility tracker, by title id or title.
// Downloaded at most weekly into the compat_external table; a game's serial is found once
// (file name, the game's own files, or a title match) and kept in rom_serials.

import fs from "fs";
import path from "path";
import { getDb, getSetting, setSetting } from "./db";
import { zipEntryNames } from "./vitaPfs";
import { titleIdFor } from "./titleIds";
import type { CompatRating } from "./db";

const REFRESHED_SETTING = "compat_lists_refreshed_at";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const SOURCES = {
  rpcs3: "https://rpcs3.net/compatibility?api=v1&export",
  vita3k: "https://github.com/Vita3K/compatibility/releases/download/compat_db/app_compat_db.xml",
  vita3kLabels: "https://api.github.com/repos/Vita3K/compatibility/labels?per_page=100",
  pcsx2: "https://raw.githubusercontent.com/PCSX2/pcsx2/master/bin/resources/GameIndex.yaml",
  azahar: "https://raw.githubusercontent.com/azahar-emu/compatibility-list/master/compatibility_list.json",
  xemu: "https://reports.xemu.app/compatibility",
  xenia: "https://api.github.com/repos/xenia-canary/game-compatibility/issues?state=open&per_page=100",
};

/** Which list covers which GameHub system. */
const LIST_FOR: Record<string, { source: string; emulator: string }> = {
  ps3: { source: "rpcs3", emulator: "RPCS3" },
  vita: { source: "vita3k", emulator: "Vita3K" },
  ps2: { source: "pcsx2", emulator: "PCSX2 · AetherSX2 · NetherSX2" },
  "3ds": { source: "azahar", emulator: "Azahar · Citra" },
  xbox: { source: "xemu", emulator: "xemu · X1 BOX · hakuX" },
  xbox360: { source: "xenia", emulator: "Xenia Canary · aX360e" },
};

/** Systems whose list has names to fall back on when a game's id can't be read. */
const TITLE_MATCH = new Set(["ps2", "3ds", "xbox360"]);

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

/** Azahar / Citra: 0 Perfect, 1 Great, 2 Okay, 3 Bad, 4 Intro/Menu, 5 Won't Boot (99 = not tested). */
const AZAHAR_STATUS: Record<number, [string, CompatRating]> = {
  0: ["Perfect", "playable"], 1: ["Great", "playable"], 2: ["Okay", "runs"], 3: ["Bad", "broken"], 4: ["Intro/Menu", "broken"], 5: ["Won't Boot", "broken"],
};
const XEMU_RATING: Record<string, CompatRating> = { Perfect: "playable", Playable: "playable", Starts: "runs", Intro: "broken", Broken: "broken" };
/** Xenia's state-* labels, best first. */
const XENIA_STATES: [string, string, CompatRating][] = [
  ["state-playable", "Playable", "playable"],
  ["state-gameplay", "Gameplay", "runs"],
  ["state-menus", "Menus", "broken"],
  ["state-intro", "Intro", "broken"],
  ["state-load", "Loads", "broken"],
  ["state-nothing", "Nothing", "broken"],
  ["state-crash", "Crash", "broken"],
];

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

async function loadAzahar(): Promise<Row[]> {
  const list = JSON.parse(await fetchText(SOURCES.azahar)) as { compatibility: number; title: string; releases?: { id: string }[] }[];
  return list.flatMap((g) => {
    const st = AZAHAR_STATUS[g.compatibility];
    if (!st) return [];
    return (g.releases ?? []).map((rel) => ({
      key: normSerial(rel.id),
      status: st[0],
      rating: st[1],
      title_norm: normTitle(g.title),
      region: null,
      updated: null,
      link: "https://azahar-emu.org/pages/compatibility/",
    }));
  });
}

async function loadXemu(): Promise<Row[]> {
  const reports = JSON.parse(await fetchText(SOURCES.xemu)) as { xbe_cert_title_id: number; compat_rating: string; created_at: number }[];
  // The newest report decides, as on xemu.app.
  const latest = new Map<number, (typeof reports)[number]>();
  for (const r of reports) {
    const cur = latest.get(r.xbe_cert_title_id);
    if (!cur || r.created_at > cur.created_at) latest.set(r.xbe_cert_title_id, r);
  }
  return [...latest.values()].flatMap((r) => {
    const rating = XEMU_RATING[r.compat_rating];
    const id = (r.xbe_cert_title_id >>> 0).toString(16).padStart(8, "0");
    return rating
      ? [{ key: id.toUpperCase(), status: r.compat_rating, rating, title_norm: null, region: null,
           updated: new Date(r.created_at * 1000).toISOString().slice(0, 10), link: `https://xemu.app/titles/${id}/` }]
      : [];
  });
}

async function loadXenia(): Promise<Row[]> {
  type Issue = { title: string; html_url: string; updated_at: string; labels: { name: string }[]; pull_request?: unknown };
  const issues: Issue[] = [];
  // GitHub only pages this far with cursors: follow each response's "next" link.
  let url: string | null = SOURCES.xenia;
  for (let page = 0; url && page < 40; page++) {
    const res: Response = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { "User-Agent": "GameHub", Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`xenia-canary/game-compatibility: HTTP ${res.status}`);
    issues.push(...((await res.json()) as Issue[]));
    url = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "")?.[1] ?? null;
  }
  // Oldest first, so the most recently updated issue for a title wins.
  issues.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  return issues.flatMap((i) => {
    const m = /^\s*([0-9A-F]{8})\s*[-–:]\s*(.+)$/i.exec(i.title);
    if (!m || i.pull_request) return [];
    const names = i.labels.map((l) => l.name);
    const st = XENIA_STATES.find(([label]) => names.includes(label));
    if (!st) return [];
    return [{ key: m[1].toUpperCase(), status: st[1], rating: st[2], title_norm: normTitle(m[2]), region: null,
              updated: i.updated_at.slice(0, 10), link: i.html_url }];
  });
}

const LOADERS = [
  ["rpcs3", loadRpcs3],
  ["vita3k", loadVita3k],
  ["pcsx2", loadPcsx2],
  ["azahar", loadAzahar],
  ["xemu", loadXemu],
  ["xenia", loadXenia],
] as const;

/** What the refresh is doing, for Settings › Maintenance › Compatibility lists. */
interface JobState {
  phase: "idle" | "downloading" | "matching";
  done: number;
  total: number;
  errors: string[];
}
const g = globalThis as unknown as { __compatJob?: JobState };
const job = (): JobState => (g.__compatJob ??= { phase: "idle", done: 0, total: 0, errors: [] });

let refreshing: Promise<void> | null = null;

/** Downloads every list again (each source independently; a failed one keeps its old rows). */
export function refreshCompatLists(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    Object.assign(job(), { phase: "downloading", done: 0, total: LOADERS.length, errors: [] });
    const db = getDb();
    const insert = db.prepare(
      `INSERT OR REPLACE INTO compat_external (source, key, status, rating, title_norm, region, updated, link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const [source, load] of LOADERS) {
      try {
        const rows = await load();
        if (!rows.length) continue;
        db.transaction(() => {
          db.prepare("DELETE FROM compat_external WHERE source = ?").run(source);
          for (const r of rows) insert.run(source, r.key, r.status, r.rating, r.title_norm, r.region, r.updated, r.link);
        })();
      } catch (e) {
        console.warn(`[compat] ${source} list:`, (e as Error).message);
        job().errors.push(`${source}: ${(e as Error).message}`);
      }
      job().done++;
    }
    setSetting(REFRESHED_SETTING, new Date().toISOString());
    // Title matches may change with a new list; serials found from files stay. Look again.
    db.prepare("DELETE FROM rom_serials WHERE serial = ''").run();
    backfillStarted = false;
  })().finally(() => {
    refreshing = null;
    if (job().phase === "downloading") job().phase = "idle";
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
  if (!serial && ["3ds", "xbox", "xbox360"].includes(rom.platform_slug)) {
    serial = normSerial((await titleIdFor(rom.platform_slug, rom.path)) ?? "");
    // A title id the list doesn't know (another region's release…): try the title instead.
    const source = LIST_FOR[rom.platform_slug].source;
    if (serial && TITLE_MATCH.has(rom.platform_slug) && !db.prepare("SELECT 1 FROM compat_external WHERE source = ? AND key = ?").get(source, serial)) serial = "";
  }
  if (!serial && TITLE_MATCH.has(rom.platform_slug)) {
    // Lists with names: match the title, preferring the same region.
    const rows = db
      .prepare("SELECT key, region FROM compat_external WHERE source = ? AND title_norm = ?")
      .all(LIST_FOR[rom.platform_slug].source, normTitle(rom.title)) as { key: string; region: string | null }[];
    const region = (rom.region ?? "").toLowerCase();
    serial = (rows.find((r) => r.region && region.includes(r.region)) ?? rows[0])?.key ?? "";
  }
  db.prepare("INSERT OR REPLACE INTO rom_serials (rom_id, serial) VALUES (?, ?)").run(rom.id, serial);
  return serial;
}

let backfillStarted = false;

/**
 * Once per server start: finds the serial / title id of every game on a list's system not looked
 * at yet (file names, title matches, Vita zips' contents, 3DS and Xbox file headers), so library cards can show the official
 * lists' ratings without each game page being opened first. Runs in the background.
 */
export function scheduleSerialBackfill(): void {
  if (backfillStarted) return;
  backfillStarted = true;
  void runBackfill();
}

async function runBackfill(): Promise<void> {
    try {
      await ensureLists();
      const db = getDb();
      const todo = db
        .prepare(
          `SELECT r.id, r.title, r.path, r.filename, r.platform_slug, r.region FROM roms r
            WHERE r.platform_slug IN (${Object.keys(LIST_FOR).map((s) => `'${s}'`).join(", ")}) AND r.missing = 0
              AND NOT EXISTS (SELECT 1 FROM rom_serials rs WHERE rs.rom_id = r.id)`
        )
        .all() as RomLite[];
      Object.assign(job(), { phase: "matching", done: 0, total: todo.length });
      for (const rom of todo) {
        await serialFor(rom).catch(() => "");
        job().done++;
        // Let requests through between games (Vita zips are opened to read their title id).
        await new Promise((r) => setImmediate(r));
      }
    } catch (e) {
      console.warn("[compat] serial backfill:", (e as Error).message);
      job().errors.push((e as Error).message);
    } finally {
      job().phase = "idle";
    }
}

/** Settings › Maintenance › Refresh now: downloads every list again, then matches games.
 *  [rematch] forgets every game's serial first (e.g. after renaming files). */
export function startCompatRefresh(rematch: boolean): boolean {
  if (job().phase !== "idle") return false;
  if (rematch) getDb().prepare("DELETE FROM rom_serials").run();
  backfillStarted = true;
  void (async () => {
    await refreshCompatLists();
    await runBackfill();
  })();
  return true;
}

export interface CompatListsStatus {
  refreshedAt: string | null;
  running: boolean;
  phase: JobState["phase"];
  done: number;
  total: number;
  errors: string[];
  sources: { source: string; emulator: string; entries: number; matched: number }[];
}

export function compatListsStatus(): CompatListsStatus {
  const db = getDb();
  const sources = Object.entries(LIST_FOR).map(([slug, l]) => ({
    source: l.source,
    emulator: l.emulator,
    entries: (db.prepare("SELECT COUNT(*) c FROM compat_external WHERE source = ?").get(l.source) as { c: number }).c,
    matched: (
      db
        .prepare(
          `SELECT COUNT(*) c FROM rom_serials rs JOIN roms r ON r.id = rs.rom_id
             JOIN compat_external ce ON ce.key = rs.serial AND ce.source = ?
            WHERE r.platform_slug = ? AND rs.serial != ''`
        )
        .get(l.source, slug) as { c: number }
    ).c,
  }));
  const j = job();
  return { refreshedAt: compatListsRefreshedAt(), running: j.phase !== "idle", phase: j.phase, done: j.done, total: j.total, errors: j.errors.slice(0, 10), sources };
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
