// DLC, updates and licenses, linked to the game they belong to.
//
// Each game file on a system with add-ons is looked at once (rom_addons): is it a base game, an
// update, a DLC or a license, which game is it for (the base game's id on its system), and its
// version / name. Add-ons are then linked to their base game (same id, else the same title) and
// left out of the library grids; the game page and GameHub Downloader list them with the game.
//
//  - Switch: title ids in file names ("[0100F2C0115B6800][v196608]") or an NSP's ticket name.
//    Base ids end in 000, updates in 800, DLC are base + 0x1000 + n.
//  - PS Vita: zips laid out app/ patch/ addcont/<TITLE_ID>/, or param.sfo (CATEGORY gd / gp / ac).
//  - PS3: PKG headers (content id + content type), .rap licenses named by content id, disc serials.
//  - 3DS: title ids (CIA TMD / NCSD / NCCH): 00040000 game, 0004000E update, 0004008C DLC.
//  - Xbox 360: STFS packages (content type: title update / marketplace content), disc title ids.
//  - Wii U: meta/meta.xml title ids: 00050000 game, 0005000E update, 0005000C DLC.
// A file in a "dlc" / "updates" folder whose id can't be read is still taken as one, and linked by title.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDb } from "./db";
import { serialFor, type RomLite } from "./compatLists";
import { n3dsInfo, stfsInfo, STFS_TYPES, titleIdFor } from "./titleIds";
import { readSfos, sfoValue, zipEntryNames } from "./vitaPfs";

export type AddonKind = "base" | "update" | "dlc" | "license";

export const ADDON_SYSTEMS = ["switch", "vita", "ps3", "3ds", "xbox360", "wiiu"];

interface Detected {
  kind: AddonKind | "";
  baseKey: string;
  addonId?: string | null;
  version?: string | null;
  name?: string | null;
  /** what's inside a package of several (a Vita DLC pack): each one's id and name */
  items?: { id: string; name: string }[] | null;
}

interface AddonRom extends RomLite {
  variant: string | null;
  sort_title: string;
}

const NOTHING: Detected = { kind: "", baseKey: "" };

// ---------- Switch ----------

/** File names inside an NSP / NSZ (a PFS0 container). */
async function pfs0Names(file: string): Promise<string[]> {
  const fh = await fs.promises.open(file, "r");
  try {
    const head = Buffer.alloc(16);
    await fh.read(head, 0, 16, 0);
    if (head.toString("latin1", 0, 4) !== "PFS0") return [];
    const count = Math.min(head.readUInt32LE(4), 1000);
    const strSize = Math.min(head.readUInt32LE(8), 1024 * 1024);
    const table = Buffer.alloc(count * 24 + strSize);
    await fh.read(table, 0, table.length, 16);
    const strings = table.subarray(count * 24);
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const off = table.readUInt32LE(i * 24 + 16);
      const end = strings.indexOf(0, off);
      names.push(strings.toString("utf8", off, end < 0 ? strings.length : end));
    }
    return names;
  } finally {
    await fh.close();
  }
}

function switchKind(id: string): { kind: AddonKind; base: string } {
  // Only the last 4 hex digits differ between a game, its update and its DLC.
  const tail = parseInt(id.slice(12), 16);
  const low = tail & 0x1fff;
  const base = id.slice(0, 12) + (tail & 0xe000).toString(16).toUpperCase().padStart(4, "0");
  return { kind: low === 0 ? "base" : low === 0x800 ? "update" : "dlc", base };
}

async function detectSwitch(rom: AddonRom): Promise<Detected> {
  let id = /\[(01[0-9A-F]{14})\]/i.exec(rom.path)?.[1]?.toUpperCase() ?? null;
  if (!id && /\.ns[pz]$/i.test(rom.path)) {
    // A ticket's name is the rights id, which starts with the title id.
    const tik = (await pfs0Names(rom.path)).find((n) => /^01[0-9a-f]{30}\.tik$/i.test(n));
    if (tik) id = tik.slice(0, 16).toUpperCase();
  }
  const version = /\[v(\d+)\]/i.exec(rom.path)?.[1];
  if (!id) return NOTHING;
  const { kind, base } = switchKind(id);
  return { kind, baseKey: base, addonId: kind === "base" ? null : id, version: version && version !== "0" ? `v${version}` : null };
}

// ---------- PS Vita ----------

const VITA_ID = /(PCS[A-Z]\d{5})/i;

async function detectVita(rom: AddonRom): Promise<Detected> {
  if (!/\.zip$/i.test(rom.path)) {
    const id = VITA_ID.exec(rom.path)?.[1]?.toUpperCase();
    return id ? { kind: "base", baseKey: id } : NOTHING;
  }
  const names = (await zipEntryNames(rom.path)).map((n) => n.replace(/\\/g, "/"));
  // Every param.sfo says what its folder is (CATEGORY gd = game, gp = update, ac = DLC); one zip can
  // hold several (a DLC pack, or a game with its update and DLC). Installed layouts say it in the
  // path too: app/ patch/ addcont/<TITLE_ID>/<DLC>/.
  const sfos = await readSfos(rom.path, names);
  type Part = { kind: AddonKind; titleId: string; dlc: string | null; title: string | null; version: string | null };
  const parts = new Map<string, Part>();
  for (const [folder, sfo] of sfos) {
    const m = /(?:^|\/)(app|patch|addcont)\/(pcs[a-z]\d{5})\/(?:([^/]+)\/)?$/i.exec(folder);
    const kind: AddonKind = sfo.category.startsWith("gp") || m?.[1] === "patch" ? "update" : sfo.category === "ac" || m?.[1] === "addcont" ? "dlc" : "base";
    const dlc = kind === "dlc" ? (sfo.contentId && sfo.contentId.length > 20 ? sfo.contentId.slice(20) : m?.[3]?.toUpperCase() ?? null) : null;
    parts.set(folder, { kind, titleId: sfo.titleId || m?.[2]?.toUpperCase() || "", dlc, title: sfo.title ?? null, version: sfo.appVer ?? null });
  }
  // DLC folders without a param.sfo of their own.
  for (const n of names) {
    const m = /^((?:.*\/)?addcont\/(PCS[A-Z]\d{5})\/([^/]+)\/)/i.exec(n);
    if (m && ![...parts.keys()].some((k) => k === m[1].toLowerCase())) {
      parts.set(m[1].toLowerCase(), { kind: "dlc", titleId: m[2].toUpperCase(), dlc: m[3], title: null, version: null });
    }
  }
  const list = [...parts.values()];
  const titleId = list.find((p) => p.titleId)?.titleId ?? VITA_ID.exec(rom.path)?.[1]?.toUpperCase() ?? "";
  if (!titleId) return NOTHING;
  const dlcs = list.filter((p) => p.kind === "dlc");
  const update = list.find((p) => p.kind === "update");
  const kind: AddonKind = list.some((p) => p.kind === "base") || !list.length ? "base" : update && !dlcs.length ? "update" : "dlc";
  return {
    kind,
    baseKey: titleId,
    addonId: kind === "dlc" && dlcs.length === 1 ? dlcs[0].dlc : null,
    version: kind === "update" && update?.version ? `v${update.version.replace(/^0/, "")}` : null,
    name: kind === "dlc" && dlcs.length === 1 ? dlcs[0].title : null,
    // A DLC pack: each DLC by name (a game bundled with its DLC lists them too).
    items: dlcs.length > (kind === "dlc" ? 1 : 0) ? dlcs.map((d) => ({ id: d.dlc ?? "", name: d.title ?? d.dlc ?? "" })) : null,
  };
}

// ---------- PS3 ----------

const PS3_CONTENT_ID = /^[A-Z]{2}\d{4}-([A-Z]{4}\d{5})_\d{2}-[A-Z0-9_]{16}/i;

/** The public key retail PS3 packages' data is AES-128-CTR encrypted with (IV: the header's data riv). */
const PS3_PKG_KEY = Buffer.from("2e7b71d7c9c9a14ea3221f188828b8f8", "hex");

/** Decrypts [len] bytes at [offset] into a retail PS3 package's data area. */
async function pkgRead(fh: fs.promises.FileHandle, dataOffset: number, riv: Buffer, offset: number, len: number): Promise<Buffer> {
  const start = offset - (offset % 16);
  const buf = Buffer.alloc(len + (offset - start));
  const { bytesRead } = await fh.read(buf, 0, buf.length, dataOffset + start);
  // CTR: the counter is the riv plus the 16-byte block number.
  let carry = BigInt(start / 16);
  const iv = Buffer.from(riv);
  for (let i = 15; i >= 0 && carry > BigInt(0); i--) {
    const v = BigInt(iv[i]) + (carry & BigInt(0xff));
    iv[i] = Number(v & BigInt(0xff));
    carry = (carry >> BigInt(8)) + (v >> BigInt(8));
  }
  const d = crypto.createDecipheriv("aes-128-ctr", PS3_PKG_KEY, iv);
  return Buffer.concat([d.update(buf.subarray(0, bytesRead)), d.final()]).subarray(offset - start);
}

/** A retail PS3 package's PARAM.SFO TITLE and APP_VER (its file table and PARAM.SFO decrypted), if readable. */
async function pkgSfo(fh: fs.promises.FileHandle, head: Buffer): Promise<{ title: string | null; version: string | null } | null> {
  if (head.readUInt16BE(0x04) !== 0x8000 || head.readUInt16BE(0x06) !== 1) return null; // finalized PS3 packages only
  const items = Math.min(head.readUInt32BE(0x14), 5000);
  const dataOffset = Number(head.readBigUInt64BE(0x20));
  const riv = head.subarray(0x70, 0x80);
  const table = await pkgRead(fh, dataOffset, riv, 0, items * 32);
  for (let i = 0; i < items && (i + 1) * 32 <= table.length; i++) {
    const e = i * 32;
    const nameOff = table.readUInt32BE(e);
    const nameLen = Math.min(table.readUInt32BE(e + 4), 256);
    const fileOff = Number(table.readBigUInt64BE(e + 8));
    const fileLen = Number(table.readBigUInt64BE(e + 16));
    if (nameLen < 9 || fileLen > 64 * 1024) continue;
    const name = (await pkgRead(fh, dataOffset, riv, nameOff, nameLen)).toString("latin1");
    if (!/(?:^|\/)PARAM\.SFO$/i.test(name)) continue;
    const sfo = await pkgRead(fh, dataOffset, riv, fileOff, fileLen);
    if (sfo.toString("latin1", 1, 4) !== "PSF") return null;
    return { title: sfoValue(sfo, "TITLE"), version: sfoValue(sfo, "APP_VER") };
  }
  return null;
}

async function detectPs3(rom: AddonRom): Promise<Detected> {
  const base = path.basename(rom.path);
  if (/\.rap$/i.test(base)) {
    const m = PS3_CONTENT_ID.exec(base);
    return m ? { kind: "license", baseKey: m[1].toUpperCase(), addonId: base.replace(/\.rap$/i, "") } : NOTHING;
  }
  if (/\.pkg$/i.test(base)) {
    const fh = await fs.promises.open(rom.path, "r");
    let contentId = "";
    let contentType = 0;
    let drm = 0;
    let sfo: { title: string | null; version: string | null } | null = null;
    try {
      const head = Buffer.alloc(0x400);
      const { bytesRead } = await fh.read(head, 0, head.length, 0);
      if (bytesRead < 0x60 || head.readUInt32BE(0) !== 0x7f504b47) return NOTHING;
      contentId = head.toString("latin1", 0x30, 0x60).replace(/\0[\s\S]*$/, "");
      // Metadata entries: id, size, data. 1 = DRM type, 2 = content type.
      let p = head.readUInt32BE(0x08);
      const count = Math.min(head.readUInt32BE(0x0c), 32);
      const meta = Buffer.alloc(0x200);
      await fh.read(meta, 0, meta.length, p);
      p = 0;
      for (let i = 0; i < count && p + 8 <= meta.length; i++) {
        const id = meta.readUInt32BE(p);
        const size = meta.readUInt32BE(p + 4);
        if (p + 12 <= meta.length && size >= 4) {
          if (id === 1) drm = meta.readUInt32BE(p + 8);
          if (id === 2) contentType = meta.readUInt32BE(p + 8);
        }
        p += 8 + size;
      }
      sfo = await pkgSfo(fh, head).catch(() => null);
    } finally {
      await fh.close();
    }
    const m = PS3_CONTENT_ID.exec(contentId);
    if (!m) return NOTHING;
    const serial = m[1].toUpperCase();
    // Game data (4) is an update or DLC; anything else (a PSN game, PS1/PS2 classic, minis) is a game.
    if (contentType !== 4) return { kind: "base", baseKey: serial };
    const upd = /-A(\d{2})(\d{2})-V\d{4}/i.exec(base);
    const isUpdate = !!upd || /\b(?:update|patch)\b/i.test(base) || drm === 3;
    const version = sfo?.version ? `v${sfo.version.replace(/^0/, "")}` : upd ? `v${Number(upd[1])}.${upd[2]}` : null;
    return {
      kind: isUpdate ? "update" : "dlc",
      baseKey: serial,
      addonId: contentId,
      version: isUpdate ? version : null,
      name: isUpdate ? null : sfo?.title ?? null,
    };
  }
  const serial = await serialFor(rom);
  return serial ? { kind: "base", baseKey: serial } : NOTHING;
}

// ---------- 3DS ----------

async function detect3ds(rom: AddonRom): Promise<Detected> {
  let id = /[[(]\s*(0004[0-9A-F]{12})\s*[\])]/i.exec(rom.path)?.[1]?.toUpperCase() ?? null;
  let version: string | null = null;
  if (/\.(?:3ds|cci|cxi|app|cia)$/i.test(rom.path)) {
    const info = await n3dsInfo(rom.path).catch(() => null);
    if (info) {
      id = info.id;
      version = info.version;
    }
  }
  if (!id) return NOTHING;
  const high = id.slice(0, 8);
  const kind: AddonKind = high === "0004000E" ? "update" : high === "0004008C" ? "dlc" : "base";
  return {
    kind,
    baseKey: id.slice(8),
    addonId: kind === "base" ? null : id,
    version: kind === "update" && version && version !== "0.0.0" ? `v${version}` : null,
  };
}

// ---------- Xbox 360 ----------

async function detectX360(rom: AddonRom): Promise<Detected> {
  let st: Awaited<ReturnType<typeof stfsInfo>> = null;
  try {
    if (fs.statSync(rom.path).isFile()) st = await stfsInfo(rom.path);
  } catch {
    /* unreadable */
  }
  if (st) {
    const kind: AddonKind =
      st.contentType === STFS_TYPES.titleUpdate ? "update" : st.contentType === STFS_TYPES.marketplace ? "dlc" : "base";
    const tu = /\bTU[\s_-]?(\d+)\b/i.exec(rom.path)?.[1];
    return { kind, baseKey: st.titleId, name: kind === "base" ? null : st.name || null, version: kind === "update" && tu ? `TU${tu}` : null };
  }
  const id = await titleIdFor("xbox360", rom.path);
  return id ? { kind: "base", baseKey: id } : NOTHING;
}

// ---------- Wii U ----------

function wiiuMetaPath(p: string): string | null {
  try {
    if (fs.statSync(p).isDirectory()) return path.join(p, "meta", "meta.xml");
  } catch {
    return null;
  }
  // A game folder's code/<name>.rpx: meta.xml is next to code/.
  return path.join(path.dirname(path.dirname(p)), "meta", "meta.xml");
}

async function detectWiiu(rom: AddonRom): Promise<Detected> {
  let id = /[[(]\s*(0005[0-9A-F]{12})\s*[\])]/i.exec(rom.path)?.[1]?.toUpperCase() ?? null;
  let version: string | null = null;
  let name: string | null = null;
  const meta = wiiuMetaPath(rom.path);
  if (meta) {
    try {
      const xml = await fs.promises.readFile(meta, "utf8");
      id = /<title_id[^>]*>\s*([0-9A-Fa-f]{16})\s*</.exec(xml)?.[1]?.toUpperCase() ?? id;
      version = /<title_version[^>]*>\s*(\d+)\s*</.exec(xml)?.[1] ?? null;
      name = /<longname_en[^>]*>([^<]+)</.exec(xml)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
    } catch {
      /* no meta.xml */
    }
  }
  if (!id) return NOTHING;
  const high = id.slice(0, 8);
  const kind: AddonKind = high === "0005000E" ? "update" : high === "0005000C" ? "dlc" : "base";
  return { kind, baseKey: id.slice(8), addonId: kind === "base" ? null : id, version: kind === "update" && version ? `v${version}` : null, name: kind === "base" ? null : name };
}

// ---------- detection + linking ----------

const DETECT: Record<string, (rom: AddonRom) => Promise<Detected>> = {
  switch: detectSwitch,
  vita: detectVita,
  ps3: detectPs3,
  "3ds": detect3ds,
  xbox360: detectX360,
  wiiu: detectWiiu,
};

/** What a "dlc" / "updates" folder says when the file itself doesn't. */
const KIND_OF_VARIANT: Record<string, AddonKind> = { dlc: "dlc", updates: "update" };

async function detect(rom: AddonRom): Promise<Detected> {
  let d = NOTHING;
  try {
    d = (await DETECT[rom.platform_slug]?.(rom)) ?? NOTHING;
  } catch {
    /* unreadable: fall through */
  }
  const byFolder = rom.variant ? KIND_OF_VARIANT[rom.variant] : undefined;
  if (byFolder && (d.kind === "" || d.kind === "base")) d = { ...d, kind: byFolder };
  return d;
}

/** Strips what add-on file names add to the game's name: "[UPD]", "Update", "DLC", "v1.2"… */
function baseTitleOf(sortTitle: string): string {
  return sortTitle
    .replace(/\b(?:update|patch|dlc|add-?on|season pass|title update|tu\s*\d+|v\d+(?:\.\d+)*)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Links every add-on to its base game: the same id on the same system, else the same title. */
function relink(): void {
  const db = getDb();
  type Row = { rom_id: number; kind: string; base_key: string; platform_slug: string; sort_title: string; variant: string | null };
  const rows = db
    .prepare(
      `SELECT ra.rom_id, ra.kind, ra.base_key, r.platform_slug, r.sort_title, r.variant
         FROM rom_addons ra JOIN roms r ON r.id = ra.rom_id WHERE r.missing = 0`
    )
    .all() as Row[];
  const bases = rows.filter((r) => r.kind === "base" || r.kind === "");
  // Main library first, then the lowest id, as the grid's representative.
  bases.sort((a, b) => (a.variant ? 1 : 0) - (b.variant ? 1 : 0) || a.rom_id - b.rom_id);
  const byKey = new Map<string, number>();
  const byTitle = new Map<string, number>();
  for (const b of bases) {
    if (b.kind === "base" && b.base_key) {
      const k = `${b.platform_slug}|${b.base_key}`;
      if (!byKey.has(k)) byKey.set(k, b.rom_id);
    }
    const t = `${b.platform_slug}|${b.sort_title}`;
    if (!byTitle.has(t)) byTitle.set(t, b.rom_id);
  }
  const titlesBySystem = new Map<string, string[]>();
  for (const k of byTitle.keys()) {
    const [slug, title] = [k.slice(0, k.indexOf("|")), k.slice(k.indexOf("|") + 1)];
    titlesBySystem.set(slug, [...(titlesBySystem.get(slug) ?? []), title]);
  }
  const parentOf = (r: Row): number | null => {
    if (r.base_key) {
      const hit = byKey.get(`${r.platform_slug}|${r.base_key}`);
      if (hit) return hit;
    }
    // By title: the add-on's name minus "update / DLC" words, or the longest game title it starts with.
    const own = baseTitleOf(r.sort_title);
    const exact = byTitle.get(`${r.platform_slug}|${own}`);
    if (exact) return exact;
    const prefix = (titlesBySystem.get(r.platform_slug) ?? [])
      .filter((t) => t.length >= 4 && own.startsWith(`${t} `))
      .sort((a, b) => b.length - a.length)[0];
    return prefix ? byTitle.get(`${r.platform_slug}|${prefix}`) ?? null : null;
  };
  const set = db.prepare("UPDATE rom_addons SET parent_id = ? WHERE rom_id = ? AND parent_id IS NOT ?");
  db.transaction(() => {
    db.prepare(
      "UPDATE rom_addons SET parent_id = NULL WHERE kind IN ('base', '') AND parent_id IS NOT NULL"
    ).run();
    for (const r of rows) {
      if (r.kind === "base" || r.kind === "") continue;
      const parent = parentOf(r);
      set.run(parent === r.rom_id ? null : parent, r.rom_id, parent === r.rom_id ? null : parent);
    }
  })();
}

interface AddonJob {
  running: boolean;
  lastRun: number;
}
const g = globalThis as unknown as { __addonJob?: AddonJob };
const job = (): AddonJob => (g.__addonJob ??= { running: false, lastRun: 0 });

/**
 * Looks at every game file on an add-on system not looked at yet, then relinks. Runs in the
 * background; called after scans and (at most once a minute) from library requests.
 */
export function scheduleAddonScan(force = false): void {
  const j = job();
  if (j.running || (!force && Date.now() - j.lastRun < 60_000)) return;
  j.running = true;
  j.lastRun = Date.now();
  void (async () => {
    try {
      const db = getDb();
      const todo = db
        .prepare(
          `SELECT r.id, r.title, r.path, r.filename, r.platform_slug, r.region, r.variant, r.sort_title FROM roms r
            WHERE r.platform_slug IN (${ADDON_SYSTEMS.map(() => "?").join(", ")}) AND r.missing = 0
              AND NOT EXISTS (SELECT 1 FROM rom_addons ra WHERE ra.rom_id = r.id)`
        )
        .all(...ADDON_SYSTEMS) as AddonRom[];
      const insert = db.prepare(
        `INSERT OR REPLACE INTO rom_addons (rom_id, kind, base_key, addon_id, version, name, items) VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const rom of todo) {
        const d = await detect(rom);
        insert.run(rom.id, d.kind, d.baseKey, d.addonId ?? null, d.version ?? null, d.name ?? null, d.items?.length ? JSON.stringify(d.items) : null);
        await new Promise((r) => setImmediate(r));
      }
      relink();
    } catch (e) {
      console.warn("[addons]", (e as Error).message);
    } finally {
      job().running = false;
    }
  })();
}

/** Looks at these games again (e.g. after a Vita zip was decrypted and rewritten). */
export function forgetAddons(romIds: number[]): void {
  const del = getDb().prepare("DELETE FROM rom_addons WHERE rom_id = ?");
  for (const id of romIds) del.run(id);
}

export interface GameAddon {
  id: number;
  kind: AddonKind;
  title: string;
  name: string | null;
  version: string | null;
  addon_id: string | null;
  filename: string;
  size_bytes: number;
  /** a package of several (a Vita DLC pack): each DLC's id and name */
  items: { id: string; name: string }[] | null;
}

/** A game's updates, DLC and licenses: updates first (newest version last), then DLC by name. */
export function gameAddons(romId: number): GameAddon[] {
  const rows = getDb()
    .prepare(
      `SELECT r.id, ra.kind, r.title, ra.name, ra.version, ra.addon_id, r.filename, r.size_bytes, ra.items
         FROM rom_addons ra CROSS JOIN roms r ON r.id = ra.rom_id
        WHERE ra.parent_id = ? AND r.missing = 0
        ORDER BY CASE ra.kind WHEN 'update' THEN 0 WHEN 'dlc' THEN 1 ELSE 2 END,
                 ra.version, COALESCE(ra.name, r.title)`
    )
    .all(romId) as (Omit<GameAddon, "items"> & { items: string | null })[];
  const list = rows.map((r) => ({ ...r, items: r.items ? (JSON.parse(r.items) as GameAddon["items"]) : null }));
  // A license (.rap) is named after the DLC it unlocks.
  for (const l of list) {
    if (l.kind !== "license" || l.name) continue;
    const dlc = list.find((d) => d.kind === "dlc" && d.addon_id && d.addon_id === l.addon_id);
    if (dlc) l.name = dlc.name ?? dlc.title;
  }
  return list;
}

/** For an add-on: the game it belongs to. */
export function addonParent(romId: number): { id: number; title: string; kind: AddonKind } | null {
  return (
    (getDb()
      .prepare(
        `SELECT p.id, p.title, ra.kind FROM rom_addons ra JOIN roms p ON p.id = ra.parent_id
          WHERE ra.rom_id = ? AND p.missing = 0`
      )
      .get(romId) as { id: number; title: string; kind: AddonKind } | undefined) ?? null
  );
}
