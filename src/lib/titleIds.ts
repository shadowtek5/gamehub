// Reads a game's title id from its own files, for matching official compatibility lists:
//  - Nintendo 3DS: .3ds/.cci (NCSD), .cxi/.app (NCCH) and .cia (its TMD) → "00040000000C1400"
//  - Xbox: an XISO / redump ISO (default.xbe in its XDVDFS file system) or a folder → "4D530004"
//  - Xbox 360: an ISO (default.xex), an extracted folder, a GOD/STFS package (CON/LIVE/PIRS) → "4D5307E6"
// Only a few KB are read from each file. Returns null when there's nothing to read (zipped, homebrew…).

import fs from "fs";
import path from "path";

async function readAt(fh: fs.promises.FileHandle, pos: number, len: number): Promise<Buffer> {
  const buf = Buffer.alloc(len);
  const { bytesRead } = await fh.read(buf, 0, len, pos);
  return buf.subarray(0, bytesRead);
}

const hex = (n: bigint | number, width: number) => n.toString(16).toUpperCase().padStart(width, "0");

// ---------- Nintendo 3DS ----------

async function n3dsTitleId(file: string): Promise<string | null> {
  return (await n3dsInfo(file))?.id ?? null;
}

/** A 3DS file's title id and, for CIAs, its title version (e.g. "1.1.0"). */
export async function n3dsInfo(file: string): Promise<{ id: string; version: string | null } | null> {
  const fh = await fs.promises.open(file, "r");
  try {
    const head = await readAt(fh, 0, 0x200);
    if (head.length >= 0x120) {
      const magic = head.toString("latin1", 0x100, 0x104);
      if (magic === "NCSD") return { id: hex(head.readBigUInt64LE(0x108), 16), version: null };
      if (magic === "NCCH") return { id: hex(head.readBigUInt64LE(0x118), 16), version: null };
    }
    // CIA: header, certificate chain, ticket, then the TMD (each 64-byte aligned).
    if (head.length >= 0x20 && head.readUInt32LE(0) === 0x2020) {
      const align = (n: number) => Math.ceil(n / 64) * 64;
      const tmd = align(head.readUInt32LE(0)) + align(head.readUInt32LE(0x08)) + align(head.readUInt32LE(0x0c));
      const sigType = (await readAt(fh, tmd, 4)).readUInt32BE(0);
      const sigLen = ({ 0x10003: 0x200 + 0x3c, 0x10004: 0x100 + 0x3c, 0x10005: 0x3c + 0x40 } as Record<number, number>)[sigType];
      if (!sigLen) return null;
      const hdr = await readAt(fh, tmd + 4 + sigLen, 0x9e);
      if (hdr.length < 0x9e) return null;
      const v = hdr.readUInt16BE(0x9c);
      return { id: hex(hdr.readBigUInt64BE(0x4c), 16), version: `${v >> 10}.${(v >> 4) & 0x3f}.${v & 0xf}` };
    }
    return null;
  } finally {
    await fh.close();
  }
}

// ---------- Xbox / Xbox 360 discs (XDVDFS) ----------

const XDVDFS_MAGIC = "MICROSOFT*XBOX*MEDIA";
/** Where the game partition starts: XISO / extracted, original Xbox redump, Xbox 360 XGD2, XGD3. */
const PARTITION_OFFSETS = [0, 0x18300000, 0xfd90000, 0x2080000];

/** Finds [wanted] in the disc's root folder: its byte offset and size. */
async function xdvdfsFind(fh: fs.promises.FileHandle, wanted: string): Promise<{ pos: number; size: number } | null> {
  for (const part of PARTITION_OFFSETS) {
    const vd = await readAt(fh, part + 32 * 2048, 0x20);
    if (vd.length < 0x20 || vd.toString("latin1", 0, 20) !== XDVDFS_MAGIC) continue;
    const rootSector = vd.readUInt32LE(20);
    const rootSize = Math.min(vd.readUInt32LE(24), 1024 * 1024);
    const dir = await readAt(fh, part + rootSector * 2048, rootSize);
    // The directory is a binary tree of entries; offsets are in 4-byte units.
    const stack = [0];
    const seen = new Set<number>();
    while (stack.length) {
      const off = stack.pop()! * 4;
      if (seen.has(off) || off + 14 > dir.length) continue;
      seen.add(off);
      const left = dir.readUInt16LE(off);
      const right = dir.readUInt16LE(off + 2);
      if (left === 0xffff) continue; // padding
      const sector = dir.readUInt32LE(off + 4);
      const size = dir.readUInt32LE(off + 8);
      const nameLen = dir[off + 13];
      const name = dir.toString("latin1", off + 14, off + 14 + nameLen);
      if (name.toLowerCase() === wanted) return { pos: part + sector * 2048, size };
      if (left) stack.push(left);
      if (right) stack.push(right);
    }
  }
  return null;
}

/** An original Xbox executable's title id (from its certificate). */
function xbeTitleId(b: Buffer): string | null {
  if (b.length < 0x120 || b.toString("latin1", 0, 4) !== "XBEH") return null;
  const base = b.readUInt32LE(0x104);
  const cert = b.readUInt32LE(0x118) - base;
  if (cert < 0 || cert + 12 > b.length) return null;
  return hex(b.readUInt32LE(cert + 8), 8);
}

/** An Xbox 360 executable's title id (from its execution info header). */
function xexTitleId(b: Buffer): string | null {
  if (b.length < 0x18 || b.toString("latin1", 0, 4) !== "XEX2") return null;
  const count = Math.min(b.readUInt32BE(0x14), 64);
  for (let i = 0; i < count; i++) {
    const e = 0x18 + i * 8;
    if (e + 8 > b.length) break;
    if (b.readUInt32BE(e) === 0x00040006) {
      const at = b.readUInt32BE(e + 4);
      return at + 16 <= b.length ? hex(b.readUInt32BE(at + 12), 8) : null;
    }
  }
  return null;
}

const EXE_HEAD = 64 * 1024;

async function xboxTitleId(file: string, x360: boolean): Promise<string | null> {
  const exe = x360 ? "default.xex" : "default.xbe";
  const parse = x360 ? xexTitleId : xbeTitleId;
  if (fs.statSync(file).isDirectory()) {
    const name = fs.readdirSync(file).find((n) => n.toLowerCase() === exe);
    if (!name) return null;
    const fh = await fs.promises.open(path.join(file, name), "r");
    try {
      return parse(await readAt(fh, 0, EXE_HEAD));
    } finally {
      await fh.close();
    }
  }
  const fh = await fs.promises.open(file, "r");
  try {
    if (x360) {
      // STFS packages (GOD containers, XBLA): the title id sits in the header.
      const magic = (await readAt(fh, 0, 4)).toString("latin1");
      if (magic === "CON " || magic === "LIVE" || magic === "PIRS") return hex((await readAt(fh, 0x360, 4)).readUInt32BE(0), 8);
    }
    const hit = await xdvdfsFind(fh, exe);
    return hit ? parse(await readAt(fh, hit.pos, Math.min(hit.size, EXE_HEAD))) : null;
  } finally {
    await fh.close();
  }
}

/** STFS content types (Xbox 360 packages). */
export const STFS_TYPES = { titleUpdate: 0x000b0000, marketplace: 0x00000002, gamesOnDemand: 0x00007000, arcade: 0x000d0000, installedGame: 0x00004000 };

/** An Xbox 360 STFS package (CON / LIVE / PIRS): title id, content type and display name. */
export async function stfsInfo(file: string): Promise<{ titleId: string; contentType: number; name: string } | null> {
  const fh = await fs.promises.open(file, "r");
  try {
    const b = await readAt(fh, 0, 0x492);
    if (b.length < 0x492) return null;
    const magic = b.toString("latin1", 0, 4);
    if (magic !== "CON " && magic !== "LIVE" && magic !== "PIRS") return null;
    // Display name: UTF-16BE at 0x411, NUL-terminated.
    const raw = Buffer.from(b.subarray(0x411, 0x491));
    raw.swap16();
    const name = raw.toString("utf16le").replace(/\0[\s\S]*$/, "").trim();
    return { titleId: hex(b.readUInt32BE(0x360), 8), contentType: b.readUInt32BE(0x344), name };
  } finally {
    await fh.close();
  }
}

// ---------- entry point ----------

/** Title ids written in file or folder names: "[0004000000055D00]", "(4D5307E6)", GOD folders "4D5307E6/00007000/…". */
const ID_IN_NAME: Record<string, RegExp[]> = {
  "3ds": [/[[(]\s*(0004[0-9A-F]{12})\s*[\])]/i],
  xbox: [/[[(]\s*([0-9A-F]{8})\s*[\])]/i],
  xbox360: [/[[(]\s*([0-9A-F]{8})\s*[\])]/i, /(?:^|[\\/])([0-9A-F]{8})[\\/]0000[0-9A-F]{4}(?:[\\/]|$)/i],
};

export async function titleIdFor(slug: string, file: string): Promise<string | null> {
  for (const re of ID_IN_NAME[slug] ?? []) {
    const m = re.exec(file);
    if (m) return m[1].toUpperCase();
  }
  try {
    if (slug === "3ds") return /\.(?:3ds|cci|cxi|app|cia)$/i.test(file) ? await n3dsTitleId(file) : null;
    if (slug === "xbox" || slug === "xbox360") return await xboxTitleId(file, slug === "xbox360");
  } catch {
    /* unreadable or missing */
  }
  return null;
}
