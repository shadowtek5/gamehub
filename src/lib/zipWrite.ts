// Writes a folder to a .zip file on disk (store method, zip64 when needed).
// Store keeps it fast and is no bigger in practice for game data that is
// already compressed/encrypted. Sizes are known from stat; each CRC is patched
// into its local header after the data is written, so files are read once.

import fs from "fs";
import path from "path";
import zlib from "zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const MAX32 = 0xffffffff;

// Native CRC-32 (Node 22.2+) is far faster over gigabytes; the table is the fallback.
const nativeCrc = (zlib as unknown as { crc32?: (data: Uint8Array, value?: number) => number }).crc32;
function crc32(buf: Uint8Array, prev: number): number {
  if (nativeCrc) return nativeCrc(buf, prev);
  let c = prev ^ 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Every file under `dir`, as zip entry names (forward slashes) + absolute paths, sorted. */
function listFiles(dir: string): { name: string; abs: string }[] {
  const out: { name: string; abs: string }[] = [];
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else if (e.isFile()) out.push({ name: r, abs: path.join(dir, r) });
    }
  };
  walk("");
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Zips every file under `dir` into `dest` (entry names relative to `dir`).
 * `isCancelled` is checked between chunks; on cancel the partial file is removed.
 */
export async function zipDirectory(
  dir: string,
  dest: string,
  opts: { isCancelled?: () => boolean; onProgress?: (done: number, total: number) => void } = {}
): Promise<number> {
  const files = listFiles(dir).map((f) => ({ ...f, size: fs.statSync(f.abs).size }));
  const total = files.reduce((n, f) => n + f.size, 0);
  const { time, date } = dosDateTime(new Date());
  const fd = fs.openSync(dest, "w");
  let pos = 0;
  let done = 0;
  const write = (buf: Buffer) => {
    let off = 0;
    while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off, pos + off);
    pos += buf.length;
  };
  const central: Buffer[] = [];

  try {
    for (const f of files) {
      const name = Buffer.from(f.name, "utf8");
      const offset = pos;
      const big = f.size >= MAX32;

      // Local header; zip64 extra (usize, csize) only when the file itself is >= 4 GiB.
      const extra = big ? Buffer.alloc(20) : Buffer.alloc(0);
      if (big) {
        extra.writeUInt16LE(0x0001, 0);
        extra.writeUInt16LE(16, 2);
        extra.writeBigUInt64LE(BigInt(f.size), 4);
        extra.writeBigUInt64LE(BigInt(f.size), 12);
      }
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(big ? 45 : 20, 4);
      local.writeUInt16LE(0x0800, 6); // UTF-8 names
      local.writeUInt16LE(0, 8); // store
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(date, 12);
      local.writeUInt32LE(0, 14); // CRC, patched below
      local.writeUInt32LE(big ? MAX32 : f.size, 18);
      local.writeUInt32LE(big ? MAX32 : f.size, 22);
      local.writeUInt16LE(name.length, 26);
      local.writeUInt16LE(extra.length, 28);
      write(local);
      write(name);
      write(extra);

      let crc = 0;
      const src = fs.openSync(f.abs, "r");
      try {
        const buf = Buffer.allocUnsafe(4 * 1024 * 1024);
        for (;;) {
          if (opts.isCancelled?.()) throw new Error("cancelled");
          const n = fs.readSync(src, buf, 0, buf.length, null);
          if (n <= 0) break;
          crc = crc32(buf.subarray(0, n), crc);
          write(buf.subarray(0, n));
          done += n;
          opts.onProgress?.(done, total);
          // Let the event loop breathe between chunks (the web UI shares this thread).
          await new Promise((r) => setImmediate(r));
        }
      } finally {
        fs.closeSync(src);
      }
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32LE(crc, 0);
      fs.writeSync(fd, crcBuf, 0, 4, offset + 14);

      // Central directory entry; zip64 extra carries usize, csize, offset when any overflows.
      const cdBig = big || offset >= MAX32;
      const cdExtra = cdBig ? Buffer.alloc(28) : Buffer.alloc(0);
      if (cdBig) {
        cdExtra.writeUInt16LE(0x0001, 0);
        cdExtra.writeUInt16LE(24, 2);
        cdExtra.writeBigUInt64LE(BigInt(f.size), 4);
        cdExtra.writeBigUInt64LE(BigInt(f.size), 12);
        cdExtra.writeBigUInt64LE(BigInt(offset), 20);
      }
      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(cdBig ? 45 : 20, 4); // made by
      cd.writeUInt16LE(cdBig ? 45 : 20, 6); // needed
      cd.writeUInt16LE(0x0800, 8);
      cd.writeUInt16LE(0, 10);
      cd.writeUInt16LE(time, 12);
      cd.writeUInt16LE(date, 14);
      cd.writeUInt32LE(crc, 16);
      cd.writeUInt32LE(cdBig ? MAX32 : f.size, 20);
      cd.writeUInt32LE(cdBig ? MAX32 : f.size, 24);
      cd.writeUInt16LE(name.length, 28);
      cd.writeUInt16LE(cdExtra.length, 30);
      cd.writeUInt32LE(cdBig ? MAX32 : offset, 42);
      central.push(cd, name, cdExtra);
    }

    const cdOffset = pos;
    for (const b of central) write(b);
    const cdSize = pos - cdOffset;
    const count = files.length;

    if (count >= 0xffff || cdOffset >= MAX32 || cdSize >= MAX32) {
      const z64Offset = pos;
      const rec = Buffer.alloc(56);
      rec.writeUInt32LE(0x06064b50, 0);
      rec.writeBigUInt64LE(BigInt(44), 4);
      rec.writeUInt16LE(45, 12);
      rec.writeUInt16LE(45, 14);
      rec.writeBigUInt64LE(BigInt(count), 24);
      rec.writeBigUInt64LE(BigInt(count), 32);
      rec.writeBigUInt64LE(BigInt(cdSize), 40);
      rec.writeBigUInt64LE(BigInt(cdOffset), 48);
      write(rec);
      const loc = Buffer.alloc(20);
      loc.writeUInt32LE(0x07064b50, 0);
      loc.writeBigUInt64LE(BigInt(z64Offset), 8);
      loc.writeUInt32LE(1, 16);
      write(loc);
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Math.min(count, 0xffff), 8);
    end.writeUInt16LE(Math.min(count, 0xffff), 10);
    end.writeUInt32LE(Math.min(cdSize, MAX32), 12);
    end.writeUInt32LE(Math.min(cdOffset, MAX32), 16);
    write(end);
  } catch (e) {
    fs.closeSync(fd);
    fs.rmSync(dest, { force: true });
    throw e;
  }
  fs.closeSync(fd);
  return pos;
}
