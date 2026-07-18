// Firmware/BIOS management: files live in data/firmware/{platform}/ under the
// exact filename the libretro core expects, and each platform's set is served
// to the game player as an uncompressed zip. Imports are gated by FILENAME —
// only files named like a BIOS this console expects are kept (no extra/unknown
// files). The content hash then decides "verified" vs "unverified"; a correctly
// named file whose hash doesn't match is still accepted, just flagged.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { getDb } from "./db";
import { platformBySlug } from "./platforms";
import { BIOS_MANIFEST, type BiosFile, type BiosSystem } from "./biosManifest";
import { getDataDir } from "./dataDir";

export interface FirmwareRow {
  id: number;
  platform_slug: string;
  filename: string;
  size_bytes: number;
  md5: string;
  sha1: string | null;
  created_at: string;
}

export function firmwareDir(slug: string): string {
  return path.join(getDataDir(), "firmware", slug);
}

export function listFirmware(slug?: string): FirmwareRow[] {
  const db = getDb();
  return (
    slug
      ? db.prepare("SELECT * FROM firmware WHERE platform_slug = ? ORDER BY filename").all(slug)
      : db.prepare("SELECT * FROM firmware ORDER BY platform_slug, filename").all()
  ) as FirmwareRow[];
}

function hashesOf(data: Buffer): { md5: string; sha1: string } {
  return {
    md5: crypto.createHash("md5").update(data).digest("hex"),
    sha1: crypto.createHash("sha1").update(data).digest("hex"),
  };
}

/** Split a canonical BIOS filename — which may include a core subdir like
 *  "pcsx2/bios/x.bin" — into safe path segments, rejecting any traversal. */
function safeRelParts(filename: string): string[] {
  const parts = filename.split(/[/\\]+/).filter((p) => p && p !== ".");
  if (!parts.length || parts.some((p) => p === "..")) {
    throw new Error(`unsafe firmware path: ${filename}`);
  }
  return parts;
}

export async function saveFirmware(
  slug: string,
  filename: string,
  data: Buffer,
  hashes?: { md5: string; sha1: string }
): Promise<FirmwareRow> {
  const dir = firmwareDir(slug);
  // Preserve any core-expected subdir (e.g. pcsx2/bios/…) so the served pack
  // extracts to the exact path the core looks in. The stored id uses forward
  // slashes; on-disk it's written under the matching nested folders.
  const parts = safeRelParts(filename);
  const rel = parts.join("/");
  const abs = path.join(dir, ...parts);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, data);
  const { md5, sha1 } = hashes ?? hashesOf(data);
  getDb()
    .prepare(
      `INSERT INTO firmware (platform_slug, filename, size_bytes, md5, sha1) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(platform_slug, filename) DO UPDATE SET size_bytes = excluded.size_bytes, md5 = excluded.md5, sha1 = excluded.sha1, created_at = datetime('now')`
    )
    .run(slug, rel, data.length, md5, sha1);
  return getDb()
    .prepare("SELECT * FROM firmware WHERE platform_slug = ? AND filename = ?")
    .get(slug, rel) as FirmwareRow;
}

export function deleteFirmware(id: number): boolean {
  const row = getDb().prepare("SELECT * FROM firmware WHERE id = ?").get(id) as
    | FirmwareRow
    | undefined;
  if (!row) return false;
  try {
    fs.rmSync(path.join(firmwareDir(row.platform_slug), row.filename), { force: true });
  } catch {}
  getDb().prepare("DELETE FROM firmware WHERE id = ?").run(id);
  return true;
}

export function firmwarePath(row: FirmwareRow): string {
  return path.join(firmwareDir(row.platform_slug), ...row.filename.split("/"));
}

// ---------- filename matching against the BIOS manifest ----------

/** True when the file's content hash matches the manifest entry (sha1 preferred,
 *  md5 fallback). A manifest entry with no known hash can't be verified → false. */
function hashVerified(f: BiosFile, h: { md5: string; sha1: string }): boolean {
  return !!((f.sha1 && f.sha1 === h.sha1) || (f.md5 && f.md5 === h.md5));
}

// A manifest file's `file` may carry a core subdir (e.g. "pcsx2/bios/x.bin"),
// but an uploaded file is matched on its basename — so compare basenames.

/** The manifest entry for `slug` whose core filename equals `base` (case-insensitive). */
function matchByName(slug: string, base: string): BiosFile | null {
  return (
    BIOS_MANIFEST[slug]?.files.find(
      (f) => path.basename(f.file).toLowerCase() === base.toLowerCase()
    ) ?? null
  );
}

/** Every (console, file) across the manifest whose core filename equals `base`. */
function matchByNameAnywhere(base: string): { slug: string; file: BiosFile }[] {
  const out: { slug: string; file: BiosFile }[] = [];
  for (const [slug, sys] of Object.entries(BIOS_MANIFEST)) {
    const f = sys.files.find((x) => path.basename(x.file).toLowerCase() === base.toLowerCase());
    if (f) out.push({ slug, file: f });
  }
  return out;
}

/** True when this manifest entry is already on disk AND verified (its stored
 *  hash matches) — nothing to gain from re-importing over a known-good copy. */
function alreadyVerified(slug: string, f: BiosFile): boolean {
  const row = getDb()
    .prepare("SELECT md5, sha1 FROM firmware WHERE platform_slug = ? AND filename = ?")
    .get(slug, f.file) as { md5: string; sha1: string | null } | undefined;
  return !!row && hashVerified(f, { md5: row.md5, sha1: row.sha1 ?? "" });
}

export type ImportOutcome =
  | { status: "verified"; slug: string; filename: string; region: string }
  | { status: "unverified"; slug: string; filename: string; region: string }
  | { status: "already-verified"; slug: string; filename: string; region: string }
  | { status: "rejected"; filename: string };

/**
 * Import a single uploaded file into `targetSlug`. Gated by FILENAME: accepted
 * only when its name matches a BIOS file this console expects — anything else is
 * disregarded (we don't keep extra files). A name match whose content hash
 * doesn't match (or is unknown) is still accepted, but flagged unverified.
 */
export async function importUpload(
  targetSlug: string,
  uploadName: string,
  data: Buffer
): Promise<ImportOutcome> {
  const base = path.basename(uploadName);
  const expected = matchByName(targetSlug, base);
  if (!expected) return { status: "rejected", filename: base };

  // Already have a verified copy — leave it untouched.
  if (alreadyVerified(targetSlug, expected)) {
    return { status: "already-verified", slug: targetSlug, filename: expected.file, region: expected.region };
  }

  const h = hashesOf(data);
  await saveFirmware(targetSlug, expected.file, data, h);
  return {
    status: hashVerified(expected, h) ? "verified" : "unverified",
    slug: targetSlug,
    filename: expected.file,
    region: expected.region,
  };
}

export interface ZipImportResult {
  imported: { name: string; slug: string; filename: string; region: string; verified: boolean }[];
  /** entries left untouched because a verified copy is already on disk */
  alreadyVerified: string[];
  /** entries not named like any expected BIOS */
  skipped: string[];
}

/**
 * Import every recognized BIOS in a zip, gated by FILENAME. With a `targetSlug`,
 * only entries named like a file that console expects are imported; without a
 * target (`auto`), an entry is filed to whichever console expects a file of that
 * name (preferring the console whose hash also matches). A name match with a
 * bad/unknown hash is imported unverified. Every other entry is skipped — no
 * extra files are kept.
 */
export async function importZip(targetSlug: string, zip: Buffer): Promise<ZipImportResult> {
  const auto = !targetSlug;
  const res: ZipImportResult = { imported: [], alreadyVerified: [], skipped: [] };
  for (const entry of readZip(zip)) {
    if (!entry.data.length || entry.name.endsWith("/")) continue;
    const base = path.basename(entry.name);
    const h = hashesOf(entry.data);

    let slug: string | null = null;
    let file: BiosFile | null = null;

    if (auto) {
      // File it to whichever console expects this name; if several do, prefer the
      // one whose hash also matches (verified), else the first.
      const candidates = matchByNameAnywhere(base);
      const best = candidates.find((c) => hashVerified(c.file, h)) ?? candidates[0];
      if (best) {
        slug = best.slug;
        file = best.file;
      }
    } else {
      file = matchByName(targetSlug, base);
      if (file) slug = targetSlug;
    }

    if (slug && file) {
      // Keep an existing verified copy rather than overwriting it.
      if (alreadyVerified(slug, file)) {
        res.alreadyVerified.push(base);
        continue;
      }
      await saveFirmware(slug, file.file, entry.data, h);
      res.imported.push({
        name: base,
        slug,
        filename: file.file,
        region: file.region,
        verified: hashVerified(file, h),
      });
    } else {
      res.skipped.push(base);
    }
  }
  return res;
}

// ---------- per-system status for the management UI ----------

export interface BiosFileStatus extends BiosFile {
  have: boolean;
  verified: boolean;
  rowId: number | null;
}
export interface BiosSystemStatus {
  slug: string;
  name: string;
  required: boolean;
  files: BiosFileStatus[];
  /** uploaded files for this system that aren't in the manifest */
  extras: FirmwareRow[];
}

/** Join the BIOS manifest with uploaded files. All BIOS-capable systems, or one
 *  when `only` is given. */
export function biosStatus(only?: string): BiosSystemStatus[] {
  const slugs = only ? (BIOS_MANIFEST[only] ? [only] : []) : Object.keys(BIOS_MANIFEST);
  const out: BiosSystemStatus[] = [];
  for (const slug of slugs.sort()) {
    const sys: BiosSystem = BIOS_MANIFEST[slug];
    const rows = listFirmware(slug);
    const byName = new Map(rows.map((r) => [r.filename.toLowerCase(), r]));
    const files: BiosFileStatus[] = sys.files.map((f) => {
      const row = byName.get(f.file.toLowerCase());
      const verified = !!row && ((f.sha1 && row.sha1 === f.sha1) || (f.md5 && row.md5 === f.md5));
      return { ...f, have: !!row, verified: !!verified, rowId: row?.id ?? null };
    });
    const known = new Set(sys.files.map((f) => f.file.toLowerCase()));
    const extras = rows.filter((r) => !known.has(r.filename.toLowerCase()));
    out.push({
      slug,
      name: platformBySlug(slug)?.name ?? slug,
      required: sys.required,
      files,
      extras,
    });
  }
  return out;
}

// ---------- minimal ZIP reader (store + deflate) ----------

/** Read entries from a zip via its central directory (handles store & deflate;
 *  ignores encrypted/other methods). Names are returned as stored. */
export function readZip(buf: Buffer): { name: string; data: Buffer }[] {
  const entries: { name: string; data: Buffer }[] = [];
  // Locate End Of Central Directory (scan back; no zip comment expected but tolerate one).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return entries;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // central dir offset
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    // Local header: recompute data start (name/extra lengths can differ).
    if (buf.readUInt32LE(localOff) !== 0x04034b50) continue;
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    try {
      const data = method === 0 ? Buffer.from(raw) : method === 8 ? zlib.inflateRawSync(raw) : null;
      if (data) entries.push({ name, data });
    } catch {
      /* skip unreadable entry */
    }
  }
  return entries;
}

// ---------- minimal ZIP writer (store method — BIOS files are tiny) ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build an uncompressed .zip from named buffers (the player extracts it) */
export function buildZip(entries: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: store
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18); // compressed size
    local.writeUInt32LE(entry.data.length, 22); // uncompressed size
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    parts.push(local, name, entry.data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // central directory signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(entry.data.length, 20);
    cd.writeUInt32LE(entry.data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42); // local header offset
    central.push(cd, name);

    offset += local.length + name.length + entry.data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, eocd]);
}
