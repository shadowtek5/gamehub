// Background file-hash job: streams every ROM missing hashes and stores
// CRC32/MD5/SHA1 — the key to exact matching via Hasheous. One at a time,
// cancellable, polled by the UI like the scrape job.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import yauzl from "yauzl";
import { getDb } from "./db";
import { FOLDER_ROM_SLUGS } from "./platforms";

/** Skip enormous files (CD/DVD images) — hash matching matters most for
 *  cartridge-era ROMs, and streaming gigabytes over SMB isn't worth it. */
export const MAX_HASH_BYTES = 256 * 1024 * 1024;

/** Abort a file's hash if no bytes arrive for this long — a healthy read emits
 *  chunks far more often; this long a gap means the share stalled/vanished. */
const HASH_READ_TIMEOUT_MS = 30_000;

export interface HashJobStatus {
  running: boolean;
  total: number;
  done: number;
  hashed: number;
  skipped: number;
  current: string;
  errors: string[];
  finishedAt: string | null;
  cancelled: boolean;
}

interface JobState extends HashJobStatus {
  cancelRequested: boolean;
}

const globalJob = globalThis as unknown as { __hashJob?: JobState };

function state(): JobState {
  if (!globalJob.__hashJob) {
    globalJob.__hashJob = {
      running: false,
      total: 0,
      done: 0,
      hashed: 0,
      skipped: 0,
      current: "",
      errors: [],
      finishedAt: null,
      cancelled: false,
      cancelRequested: false,
    };
  }
  return globalJob.__hashJob;
}

export function getHashJobStatus(): HashJobStatus {
  const s = state();
  return { ...s, errors: s.errors.slice(0, 25) };
}

export function cancelHashJob(): boolean {
  const s = state();
  if (!s.running) return false;
  s.cancelRequested = true;
  return true;
}

// CRC32 slice-by-8: eight lookup tables, eight bytes consumed per iteration
// (~5-8× the classic per-byte loop). Standard reflected polynomial 0xEDB88320.
const CRC_TABLES: Uint32Array[] = (() => {
  const tables = Array.from({ length: 8 }, () => new Uint32Array(256));
  const t0 = tables[0];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t0[n] = c >>> 0;
  }
  for (let t = 1; t < 8; t++) {
    const prev = tables[t - 1];
    const cur = tables[t];
    for (let n = 0; n < 256; n++) {
      const c = prev[n];
      cur[n] = (t0[c & 0xff] ^ (c >>> 8)) >>> 0;
    }
  }
  return tables;
})();

function crc32Update(crc: number, buf: Buffer): number {
  const [t0, t1, t2, t3, t4, t5, t6, t7] = CRC_TABLES;
  let c = crc >>> 0;
  let i = 0;
  const len = buf.length;
  const last = len - 8;
  for (; i <= last; i += 8) {
    c = (c ^ (buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24))) >>> 0;
    c =
      (t7[c & 0xff] ^
        t6[(c >>> 8) & 0xff] ^
        t5[(c >>> 16) & 0xff] ^
        t4[(c >>> 24) & 0xff] ^
        t3[buf[i + 4]] ^
        t2[buf[i + 5]] ^
        t1[buf[i + 6]] ^
        t0[buf[i + 7]]) >>>
      0;
  }
  for (; i < len; i++) c = (t0[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return c >>> 0;
}

export interface FileHashes {
  crc32: string;
  md5: string;
  sha1: string;
}

/** Non-ROM files inside a ROM archive that must not be mistaken for the dump. */
const ARCHIVE_JUNK = /\.(txt|nfo|diz|md|sfv|dat|db|url|jpg|jpeg|png)$/i;

function finishHashes(crc: number, md5: crypto.Hash, sha1: crypto.Hash): FileHashes {
  return {
    crc32: ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0"),
    md5: md5.digest("hex"),
    sha1: sha1.digest("hex"),
  };
}

/** Hash a ROM. For `.zip` archives the DAT-comparable hash is of the *inner*
 *  uncompressed ROM (that's what No-Intro/Redump record), so we decompress and
 *  hash the single contained file. Multi-file / oversized / unreadable archives
 *  fall back to hashing the raw archive bytes — no worse than the old behavior,
 *  just won't hash-match a DAT. */
export async function hashFile(filePath: string): Promise<FileHashes> {
  if (path.extname(filePath).toLowerCase() === ".zip") {
    const inner = await hashZipInner(filePath).catch(() => null);
    if (inner) return inner;
  }
  return hashRawFile(filePath);
}

/** Hash the single ROM entry inside a ZIP (decompressed). Returns null when the
 *  archive has zero or several ROM-like entries, the entry is over the size cap,
 *  or anything goes wrong — the caller then falls back to raw hashing. */
function hashZipInner(filePath: string): Promise<FileHashes | null> {
  return new Promise((resolve) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err || !zip) return resolve(null);
      const done = (v: FileHashes | null) => {
        try { zip.close(); } catch {}
        resolve(v);
      };
      const roms: yauzl.Entry[] = [];
      zip.on("entry", (entry) => {
        const isDir = /\/$/.test(entry.fileName);
        if (!isDir && !ARCHIVE_JUNK.test(entry.fileName)) roms.push(entry);
        zip.readEntry();
      });
      zip.on("error", () => done(null));
      zip.on("end", () => {
        // A single contained ROM is the norm; 0 or many can't map to one dump.
        if (roms.length !== 1 || roms[0].uncompressedSize > MAX_HASH_BYTES) return done(null);
        zip.openReadStream(roms[0], (e, stream) => {
          if (e || !stream) return done(null);
          const md5 = crypto.createHash("md5");
          const sha1 = crypto.createHash("sha1");
          let crc = 0xffffffff;
          stream.on("data", (chunk) => {
            const buf = chunk as Buffer;
            md5.update(buf);
            sha1.update(buf);
            crc = crc32Update(crc, buf);
          });
          stream.on("end", () => done(finishHashes(crc, md5, sha1)));
          stream.on("error", () => done(null));
        });
      });
      zip.readEntry();
    });
  });
}

function hashRawFile(filePath: string): Promise<FileHashes> {
  return new Promise((resolve, reject) => {
    const md5 = crypto.createHash("md5");
    const sha1 = crypto.createHash("sha1");
    let crc = 0xffffffff;
    const stream = fs.createReadStream(filePath, { highWaterMark: 1 << 20 });
    // Idle-read watchdog: if a share goes away mid-read (or a stream stalls),
    // fail this file instead of hanging forever — otherwise the whole job would
    // freeze at 0. The file stays unhashed and retries on the next run.
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => stream.destroy(new Error("read timed out (share unreachable?)")), HASH_READ_TIMEOUT_MS);
    };
    arm();
    stream.on("data", (chunk) => {
      arm();
      const buf = chunk as Buffer;
      md5.update(buf);
      sha1.update(buf);
      crc = crc32Update(crc, buf);
    });
    stream.on("end", () => {
      clearTimeout(timer);
      resolve(finishHashes(crc, md5, sha1));
    });
    stream.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

/** How many files to hash concurrently. Some parallelism overlaps the network
 *  read (waiting on the share) with CPU hashing, but hashing runs on the same
 *  single Node thread that serves the web UI — too many in flight floods the
 *  event loop and makes the app sluggish. Keep it modest. */
export const HASH_CONCURRENCY = 8;

/** Hard ceiling on concurrent file streams (bounds open handles, buffered
 *  memory, and event-loop pressure). */
export const MAX_HASH_CONCURRENCY = 16;

export interface HashRow {
  id: number;
  path: string;
  size_bytes: number;
  title?: string;
}

/** Hash many ROMs in parallel, writing crc32/md5/sha1 as each finishes. The DB
 *  write is handled here; callbacks are just for progress/cancellation so both
 *  the standalone hash job and the scan can share the pool. */
export async function hashRoms(
  rows: HashRow[],
  opts: {
    concurrency?: number;
    isCancelled?: () => boolean;
    onStart?: (row: HashRow) => void;
    onHashed?: (row: HashRow) => void;
    onSkipped?: (row: HashRow) => void;
    onError?: (row: HashRow, err: unknown) => void;
    onDone?: (row: HashRow) => void;
  } = {}
): Promise<void> {
  const update = getDb().prepare("UPDATE roms SET crc32 = ?, md5 = ?, sha1 = ? WHERE id = ?");
  const workers = Math.max(1, Math.min(opts.concurrency ?? HASH_CONCURRENCY, MAX_HASH_CONCURRENCY));
  let next = 0;
  const worker = async () => {
    for (;;) {
      if (opts.isCancelled?.()) return;
      const i = next++;
      if (i >= rows.length) return;
      const row = rows[i];
      opts.onStart?.(row);
      if (row.size_bytes > MAX_HASH_BYTES) {
        opts.onSkipped?.(row);
      } else {
        try {
          const h = await hashFile(row.path);
          update.run(h.crc32, h.md5, h.sha1, row.id);
          opts.onHashed?.(row);
        } catch (e) {
          opts.onError?.(row, e);
        }
      }
      opts.onDone?.(row);
    }
  };
  await Promise.all(Array.from({ length: workers }, worker));
}

/** Hash all visible ROMs missing hashes (optionally only some systems).
 *  With `rehashArchives`, .zip/.7z ROMs are re-hashed even if they already have
 *  hashes — needed once to replace legacy outer-archive hashes with the inner
 *  ROM hashes that actually match No-Intro/Redump DATs. */
export function startHashJob(
  systems?: string[],
  opts: { rehashArchives?: boolean } = {},
  onComplete?: () => void
): boolean {
  const s = state();
  if (s.running) {
    onComplete?.();
    return false;
  }

  const db = getDb();
  const plat = systems?.length
    ? ` AND platform_slug IN (${systems.map(() => "?").join(",")})`
    : "";
  // Folder-based ROMs (Wii U, …) are directories, not streamable files — exclude.
  const folderExcl = FOLDER_ROM_SLUGS.length
    ? ` AND platform_slug NOT IN (${FOLDER_ROM_SLUGS.map(() => "?").join(",")})`
    : "";
  // Normally only unhashed rows; when re-hashing archives, also pick up already-
  // hashed .zip/.7z files so their hashes get recomputed from the inner ROM.
  const needHash = opts.rehashArchives
    ? "(md5 IS NULL OR lower(path) LIKE '%.zip' OR lower(path) LIKE '%.7z')"
    : "md5 IS NULL";
  const rows = db
    .prepare(
      `SELECT id, path, title, size_bytes FROM roms
       WHERE missing = 0 AND ${needHash}${plat}${folderExcl} ORDER BY size_bytes`
    )
    .all(...(systems ?? []), ...FOLDER_ROM_SLUGS) as {
    id: number;
    path: string;
    title: string;
    size_bytes: number;
  }[];

  s.running = true;
  s.total = rows.length;
  s.done = 0;
  s.hashed = 0;
  s.skipped = 0;
  s.current = "";
  s.errors = [];
  s.finishedAt = null;
  s.cancelled = false;
  s.cancelRequested = false;

  void (async () => {
    try {
      await hashRoms(rows, {
        isCancelled: () => s.cancelRequested,
        onStart: (r) => {
          s.current = r.title ?? "";
        },
        onHashed: () => {
          s.hashed++;
        },
        onSkipped: () => {
          s.skipped++;
        },
        onError: (r, e) => {
          if (s.errors.length < 25) {
            s.errors.push(`${r.title}: ${e instanceof Error ? e.message : e}`);
          }
        },
        onDone: () => {
          s.done++;
        },
      });
      if (s.cancelRequested) s.cancelled = true;
    } finally {
      s.running = false;
      s.current = "";
      s.finishedAt = new Date().toISOString();
      onComplete?.();
    }
  })();

  return true;
}
