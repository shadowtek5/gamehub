// Save sync for external clients (e.g. GameHub Downloader on a handheld).
//
// Battery saves (.srm) are the same slot the browser player uses; device saves
// are emulator save folders (PSP SAVEDATA, Vita/3DS title data, …) stored as a
// zip per (platform, save key). Every save carries a SHA-256 and an updated
// time; uploads can be made conditional with If-Match / If-None-Match so one
// device never silently overwrites another's newer save.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDb } from "./db";
import { getDataDir } from "./dataDir";

export interface BatterySaveMeta {
  romId: number;
  sha256: string;
  size: number;
  updatedAt: string;
}

export interface DeviceSaveMeta {
  platform: string;
  key: string;
  romId: number | null;
  title: string | null;
  device: string | null;
  sha256: string;
  size: number;
  updatedAt: string;
}

/** SQLite datetime('now') ("YYYY-MM-DD HH:MM:SS", UTC) → ISO 8601 with Z. */
export function isoUtc(sqlite: string): string {
  return sqlite.includes("T") ? sqlite : `${sqlite.replace(" ", "T")}Z`;
}

export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** The hash an If-Match / If-None-Match header names: `"abc…"`, `W/"abc…"`, `abc…` or `*`. */
export function etagValue(header: string | null): string | null {
  if (!header) return null;
  const v = header.trim().replace(/^W\//, "").replace(/^"|"$/g, "");
  return v || null;
}

/**
 * Checks a conditional upload against the current hash (null = no save yet).
 * If-Match: <hash> must equal the current one; If-None-Match: * requires no save.
 * Returns null when the write may proceed.
 */
export function preconditionFailure(
  headers: Headers,
  current: string | null
): string | null {
  const ifMatch = etagValue(headers.get("if-match"));
  const ifNoneMatch = etagValue(headers.get("if-none-match"));
  if (ifNoneMatch === "*" && current) return "A save already exists";
  if (ifMatch && ifMatch !== "*" && ifMatch !== current) return "The save changed since you last synced";
  if (ifMatch === "*" && !current) return "No save to replace";
  return null;
}

function batteryFile(userId: number, romId: number): string {
  return path.join(getDataDir(), "battery", String(userId), `${romId}.srm`);
}

/** Battery save meta for one game, hashing (and storing the hash) when it's missing. */
export function batteryMeta(userId: number, romId: number): BatterySaveMeta | null {
  const row = getDb()
    .prepare("SELECT save_path, size_bytes, updated_at, sha256 FROM battery_saves WHERE user_id = ? AND rom_id = ?")
    .get(userId, romId) as { save_path: string | null; size_bytes: number; updated_at: string; sha256: string | null } | undefined;
  if (!row) return null;
  let hash = row.sha256;
  if (!hash) {
    const file = row.save_path ? path.join(getDataDir(), row.save_path) : batteryFile(userId, romId);
    if (!fs.existsSync(file)) return null;
    hash = sha256(fs.readFileSync(file));
    getDb().prepare("UPDATE battery_saves SET sha256 = ? WHERE user_id = ? AND rom_id = ?").run(hash, userId, romId);
  }
  return { romId, sha256: hash, size: row.size_bytes, updatedAt: isoUtc(row.updated_at) };
}

/** Every battery save of a user (hashes filled in on demand). */
export function listBatterySaves(userId: number): BatterySaveMeta[] {
  const ids = getDb()
    .prepare("SELECT rom_id FROM battery_saves WHERE user_id = ? ORDER BY rom_id")
    .all(userId) as { rom_id: number }[];
  return ids.map((r) => batteryMeta(userId, r.rom_id)).filter((m): m is BatterySaveMeta => m !== null);
}

const PLATFORM_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** Validates a device-save platform + key from the URL; null when acceptable. */
export function deviceSaveKeyError(platform: string, key: string): string | null {
  if (!PLATFORM_RE.test(platform)) return "Invalid platform";
  // Keys are save ids (ULUS10336, PCSE01168, 0004000000055D00) or a ROM's base name.
  if (!key || key.length > 255 || /[\u0000-\u001f/\\]/.test(key)) return "Invalid save key";
  return null;
}

/** Where a device save's zip lives (named by a hash of the key: keys may hold any characters). */
export function deviceSaveFile(userId: number, platform: string, key: string): string {
  const name = crypto.createHash("sha1").update(key).digest("hex");
  return path.join(getDataDir(), "devicesaves", String(userId), platform, `${name}.zip`);
}

type DeviceRow = {
  platform: string;
  save_key: string;
  rom_id: number | null;
  title: string | null;
  device: string | null;
  sha256: string;
  size_bytes: number;
  save_path: string;
  updated_at: string;
};

function toMeta(r: DeviceRow): DeviceSaveMeta {
  return {
    platform: r.platform,
    key: r.save_key,
    romId: r.rom_id,
    title: r.title,
    device: r.device,
    sha256: r.sha256,
    size: r.size_bytes,
    updatedAt: isoUtc(r.updated_at),
  };
}

export function deviceSaveRow(userId: number, platform: string, key: string): (DeviceSaveMeta & { savePath: string }) | null {
  const r = getDb()
    .prepare("SELECT * FROM device_saves WHERE user_id = ? AND platform = ? AND save_key = ?")
    .get(userId, platform, key) as DeviceRow | undefined;
  return r ? { ...toMeta(r), savePath: r.save_path } : null;
}

export function listDeviceSaves(userId: number, romId?: number): DeviceSaveMeta[] {
  const rows = (
    romId === undefined
      ? getDb().prepare("SELECT * FROM device_saves WHERE user_id = ? ORDER BY platform, save_key").all(userId)
      : getDb().prepare("SELECT * FROM device_saves WHERE user_id = ? AND rom_id = ? ORDER BY updated_at DESC").all(userId, romId)
  ) as DeviceRow[];
  return rows.map(toMeta);
}

/** Response headers that describe a save version. */
export function versionHeaders(meta: { sha256: string; updatedAt: string }): Record<string, string> {
  return { ETag: `"${meta.sha256}"`, "X-Save-Sha256": meta.sha256, "X-Save-Updated-At": meta.updatedAt };
}
