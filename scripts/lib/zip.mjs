// Minimal, dependency-free ZIP writer (store + deflate).
//
// Used by scripts/build-release.mjs to package a GameHub release. Kept
// dependency-free on purpose: the release is built inside node:22-bookworm-slim
// (which ships no `zip` CLI) and is also runnable from a Windows dev box.
//
// Scope/limits: classic ZIP (not ZIP64). Guards throw if the archive would
// exceed 0xFFFFFFFF bytes or 0xFFFF entries — a standalone GameHub build is far
// under both. Output is read back by yauzl in the installer.

import fs from "fs";
import path from "path";
import zlib from "zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const year = Math.max(1980, d.getFullYear()) - 1980;
  const date = ((year & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time: time & 0xffff, date: date & 0xffff };
}

const S_IFREG = 0o100000;
const S_IFLNK = 0o120000;

/**
 * Recursively list entries under `root`. Symlinks are preserved as symlink
 * entries (NOT followed) — Next.js's standalone output puts directory symlinks
 * under .next/node_modules/<pkg>-<hash> pointing at ../../node_modules/<pkg> for
 * every serverExternalPackages native module (better-sqlite3, sharp). Dropping
 * them breaks `require("<pkg>-<hash>")` at runtime, so they must survive.
 */
function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const st = fs.lstatSync(abs);
      if (st.isSymbolicLink()) out.push({ abs, type: "symlink" });
      else if (st.isDirectory()) stack.push(abs);
      else if (st.isFile()) out.push({ abs, type: "file" });
    }
  }
  out.sort((a, b) => (a.abs < b.abs ? -1 : a.abs > b.abs ? 1 : 0));
  return out;
}

/**
 * Zip the contents of `srcDir` into `outFile` (entries are relative to srcDir,
 * so the archive has no top-level wrapper folder). Returns { entries, bytes }.
 */
export function zipDir(srcDir, outFile) {
  const files = walk(srcDir);
  if (files.length > 0xffff) {
    throw new Error(`Too many files for classic ZIP (${files.length} > 65535); ZIP64 not implemented.`);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const fd = fs.openSync(outFile, "w");
  let offset = 0;
  const central = [];
  const now = new Date();
  const { time, date } = dosDateTime(now);

  try {
    for (const entry of files) {
      const abs = entry.abs;
      const rel = path.relative(srcDir, abs).split(path.sep).join("/");
      const nameBuf = Buffer.from(rel, "utf8");

      // symlinks: content is the link target string; unix mode marks it S_IFLNK
      // so the extractor recreates a symlink instead of a plain file.
      const isLink = entry.type === "symlink";
      const raw = isLink
        ? Buffer.from(fs.readlinkSync(abs).split(path.sep).join("/"), "utf8")
        : fs.readFileSync(abs);
      const crc = crc32(raw);
      const deflated = isLink ? raw : zlib.deflateRawSync(raw, { level: 6 });
      // store if deflate didn't help (already-compressed assets, tiny files, links)
      const useStore = deflated.length >= raw.length;
      const method = useStore ? 0 : 8;
      const body = useStore ? raw : deflated;
      const externalAttrs = (((isLink ? S_IFLNK | 0o777 : S_IFREG | 0o644) << 16) >>> 0);

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4); // version needed
      local.writeUInt16LE(0, 6); // flags
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(body.length, 18);
      local.writeUInt32LE(raw.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      local.writeUInt16LE(0, 28); // extra len

      fs.writeSync(fd, local);
      fs.writeSync(fd, nameBuf);
      if (body.length) fs.writeSync(fd, body);

      central.push({
        nameBuf,
        crc,
        method,
        time,
        date,
        compSize: body.length,
        rawSize: raw.length,
        offset,
        externalAttrs,
      });
      offset += local.length + nameBuf.length + body.length;
      if (offset > 0xffffffff) throw new Error("Archive exceeds 4 GB; ZIP64 not implemented.");
    }

    const cdStart = offset;
    for (const e of central) {
      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(20, 4); // version made by
      cd.writeUInt16LE(20, 6); // version needed
      cd.writeUInt16LE(0, 8); // flags
      cd.writeUInt16LE(e.method, 10);
      cd.writeUInt16LE(e.time, 12);
      cd.writeUInt16LE(e.date, 14);
      cd.writeUInt32LE(e.crc, 16);
      cd.writeUInt32LE(e.compSize, 20);
      cd.writeUInt32LE(e.rawSize, 24);
      cd.writeUInt16LE(e.nameBuf.length, 28);
      cd.writeUInt16LE(0, 30); // extra
      cd.writeUInt16LE(0, 32); // comment
      cd.writeUInt16LE(0, 34); // disk start
      cd.writeUInt16LE(0, 36); // internal attrs
      cd.writeUInt32LE(e.externalAttrs, 38); // external attrs (unix mode in high 16 bits)
      cd.writeUInt32LE(e.offset, 42); // local header offset
      fs.writeSync(fd, cd);
      fs.writeSync(fd, e.nameBuf);
      offset += cd.length + e.nameBuf.length;
    }
    const cdSize = offset - cdStart;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); // disk
    eocd.writeUInt16LE(0, 6); // cd disk
    eocd.writeUInt16LE(central.length, 8);
    eocd.writeUInt16LE(central.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20); // comment len
    fs.writeSync(fd, eocd);
  } finally {
    fs.closeSync(fd);
  }

  return { entries: files.length, bytes: fs.statSync(outFile).size };
}
