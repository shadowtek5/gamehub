// Backup & restore: everything GameHub owns (the data/ folder) as a single
// streaming .tar archive — no memory buffering, no 4 GB zip limits.
//
// Contents (selectable): gamehub.db snapshot (always, taken with SQLite's
// online-backup API so it's consistent while the app runs), saves/,
// firmware/, media/, launchbox.db — plus a manifest.json.
//
// Restore validates every entry name, extracts to a staging folder, then
// swaps files in atomically-ish: the previous database is kept as
// gamehub.db.pre-restore. ROM files are never part of a backup.

import fs from "fs";
import path from "path";
import { getDb, closeDb } from "./db";
import packageJson from "../../package.json";

const DATA_DIR = path.join(process.cwd(), "data");
const BLOCK = 512;

export interface BackupParts {
  saves: boolean;
  firmware: boolean;
  media: boolean;
  launchbox: boolean;
}

export interface BackupManifest {
  app: string;
  version: string;
  created_at: string;
  parts: BackupParts & { db: true };
}

// ---------------------------------------------------------------- tar write

function octal(value: number, length: number): Buffer {
  const buf = Buffer.alloc(length, 0);
  buf.write(value.toString(8).padStart(length - 1, "0") + "\0", 0, "ascii");
  return buf;
}

/** ustar header; base-256 size encoding for files >= 8 GB. */
function tarHeader(name: string, size: number, mtimeSec: number, type: "0" | "5"): Buffer {
  const h = Buffer.alloc(BLOCK, 0);
  let base = name;
  let prefix = "";
  if (Buffer.byteLength(base) > 100) {
    const cut = name.lastIndexOf("/", 154);
    if (cut > 0 && Buffer.byteLength(name.slice(cut + 1)) <= 100) {
      prefix = name.slice(0, cut);
      base = name.slice(cut + 1);
    }
  }
  h.write(base, 0, 100, "utf8");
  octal(0o644, 8).copy(h, 100); // mode
  octal(0, 8).copy(h, 108); // uid
  octal(0, 8).copy(h, 116); // gid
  if (size < 0o77777777777) {
    octal(size, 12).copy(h, 124);
  } else {
    // GNU base-256: high bit set, big-endian value
    h[124] = 0x80;
    let v = size;
    for (let i = 135; i > 124; i--) {
      h[i] = v & 0xff;
      v = Math.floor(v / 256);
    }
  }
  octal(mtimeSec, 12).copy(h, 136);
  h.fill(0x20, 148, 156); // checksum placeholder = spaces
  h.write(type, 156, 1, "ascii");
  h.write("ustar", 257, "ascii");
  h.write("00", 263, "ascii");
  h.write(prefix, 345, 155, "utf8");
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += h[i];
  octal(sum, 8).copy(h, 148);
  return h;
}

function pad(size: number): Buffer {
  const rem = size % BLOCK;
  return rem === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK - rem);
}

function walkFiles(dir: string, baseTarPath: string): { tarPath: string; fsPath: string }[] {
  const out: { tarPath: string; fsPath: string }[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fsPath = path.join(dir, e.name);
    const tarPath = `${baseTarPath}/${e.name}`;
    if (e.isDirectory()) out.push(...walkFiles(fsPath, tarPath));
    else if (e.isFile()) out.push({ tarPath, fsPath });
  }
  return out;
}

/** Build the streaming tar. Returns the web stream plus a suggested name. */
export async function streamBackupTar(parts: BackupParts): Promise<{
  stream: ReadableStream<Uint8Array>;
  filename: string;
}> {
  // Consistent snapshot of the live database (safe under WAL while running)
  const snapshot = path.join(DATA_DIR, `.backup-snapshot-${Date.now()}.db`);
  await getDb().backup(snapshot);

  const manifest: BackupManifest = {
    app: "GameHub",
    version: (packageJson as { version?: string }).version ?? "0.0.0",
    created_at: new Date().toISOString(),
    parts: { db: true, ...parts },
  };
  const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");

  // The credential-encryption key (data/.secret.key) is deliberately NOT
  // bundled — a backup should not be able to decrypt its own secrets. Operators
  // must copy the key somewhere safe (or set GAMEHUB_SECRET_KEY); the Backup UI
  // warns about this.
  const files: { tarPath: string; fsPath: string }[] = [
    { tarPath: "gamehub.db", fsPath: snapshot },
  ];
  if (parts.saves) files.push(...walkFiles(path.join(DATA_DIR, "saves"), "saves"));
  if (parts.firmware) files.push(...walkFiles(path.join(DATA_DIR, "firmware"), "firmware"));
  if (parts.media) files.push(...walkFiles(path.join(DATA_DIR, "media"), "media"));
  if (parts.launchbox && fs.existsSync(path.join(DATA_DIR, "launchbox.db"))) {
    files.push({ tarPath: "launchbox.db", fsPath: path.join(DATA_DIR, "launchbox.db") });
  }

  const now = Math.floor(Date.now() / 1000);
  const cleanup = () => {
    try {
      fs.unlinkSync(snapshot);
    } catch {}
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          const push = async (buf: Buffer) => {
            controller.enqueue(new Uint8Array(buf));
            while ((controller.desiredSize ?? 1) <= 0) {
              await new Promise((r) => setTimeout(r, 25));
            }
          };

          await push(tarHeader("manifest.json", manifestBuf.length, now, "0"));
          await push(manifestBuf);
          await push(pad(manifestBuf.length));

          for (const f of files) {
            const size = fs.statSync(f.fsPath).size;
            await push(tarHeader(f.tarPath, size, now, "0"));
            const rs = fs.createReadStream(f.fsPath, { highWaterMark: 1024 * 1024 });
            for await (const chunk of rs) await push(chunk as Buffer);
            await push(pad(size));
          }

          await push(Buffer.alloc(BLOCK * 2)); // end-of-archive
          controller.close();
        } catch (e) {
          controller.error(e);
        } finally {
          cleanup();
        }
      })();
    },
    cancel: cleanup,
  });

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return { stream, filename: `gamehub-backup-${stamp}.tar` };
}

// ---------------------------------------------------------------- tar read

function parseSize(h: Buffer): number {
  if (h[124] & 0x80) {
    let v = 0;
    for (let i = 125; i < 136; i++) v = v * 256 + h[i];
    return v;
  }
  return parseInt(h.toString("ascii", 124, 136).replace(/\0.*$/, "").trim() || "0", 8);
}

function parseName(h: Buffer): string {
  const name = h.toString("utf8", 0, 100).replace(/\0.*$/, "");
  const prefix = h.toString("utf8", 345, 500).replace(/\0.*$/, "");
  return prefix ? `${prefix}/${name}` : name;
}

const ALLOWED = (name: string) =>
  name === "manifest.json" ||
  name === "gamehub.db" ||
  name === "launchbox.db" ||
  name.startsWith("saves/") ||
  name.startsWith("firmware/") ||
  name.startsWith("media/");

function safeName(name: string): boolean {
  if (!name || name.includes("\\") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) return false;
  return !name.split("/").some((seg) => seg === ".." || seg === "");
}

export interface RestoreResult {
  manifest: BackupManifest;
  restored: string[];
  files: number;
}

/** Validate + extract a backup tar, then swap it into data/. Destructive for
 *  the parts contained in the backup (db always; media/saves/firmware/
 *  launchbox only when present). Keeps gamehub.db.pre-restore as a safety. */
export async function restoreBackupTar(tarPath: string): Promise<RestoreResult> {
  const staging = path.join(DATA_DIR, ".restore-tmp");
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  let manifest: BackupManifest | null = null;
  let fileCount = 0;
  const topLevel = new Set<string>();

  const fd = fs.openSync(tarPath, "r");
  try {
    const header = Buffer.alloc(BLOCK);
    let pos = 0;
    for (;;) {
      const n = fs.readSync(fd, header, 0, BLOCK, pos);
      if (n < BLOCK) break;
      pos += BLOCK;
      if (header.every((b) => b === 0)) break; // end-of-archive
      const rawName = parseName(header);
      const size = parseSize(header);
      const type = String.fromCharCode(header[156]);
      const dataBlocks = Math.ceil(size / BLOCK) * BLOCK;

      if (type === "0" || type === "\0") {
        const name = rawName.replace(/^\.\//, "");
        if (!safeName(name) || !ALLOWED(name)) {
          throw new Error(`Backup contains a disallowed entry: ${rawName}`);
        }
        const target = path.join(staging, name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const out = fs.createWriteStream(target);
        let remaining = size;
        const chunk = Buffer.alloc(1024 * 1024);
        let readPos = pos;
        while (remaining > 0) {
          const want = Math.min(remaining, chunk.length);
          const got = fs.readSync(fd, chunk, 0, want, readPos);
          if (got <= 0) throw new Error("Backup file is truncated");
          await new Promise<void>((resolve, reject) => {
            out.write(Buffer.from(chunk.subarray(0, got)), (err) => (err ? reject(err) : resolve()));
          });
          remaining -= got;
          readPos += got;
        }
        await new Promise<void>((resolve, reject) => {
          out.end((err?: Error | null) => (err ? reject(err) : resolve()));
        });
        fileCount++;
        topLevel.add(name.split("/")[0]);
        if (name === "manifest.json") {
          try {
            manifest = JSON.parse(fs.readFileSync(target, "utf8"));
          } catch {
            throw new Error("manifest.json in the backup is unreadable");
          }
        }
      }
      pos += dataBlocks;
    }
  } finally {
    fs.closeSync(fd);
  }

  if (!manifest || manifest.app !== "GameHub") {
    fs.rmSync(staging, { recursive: true, force: true });
    throw new Error("Not a GameHub backup (missing or invalid manifest.json)");
  }
  if (!fs.existsSync(path.join(staging, "gamehub.db"))) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw new Error("Backup contains no database");
  }

  // ---- swap phase ----
  const restored: string[] = [];
  closeDb();
  // the LaunchBox mirror keeps its own handle open — release it too
  const g = globalThis as unknown as { __lbDb?: { close: () => void } };
  if (g.__lbDb) {
    try {
      g.__lbDb.close();
    } catch {}
    g.__lbDb = undefined;
  }
  try {
    // database: keep the previous one as a safety copy
    const live = path.join(DATA_DIR, "gamehub.db");
    if (fs.existsSync(live)) fs.copyFileSync(live, path.join(DATA_DIR, "gamehub.db.pre-restore"));
    for (const suffix of ["-wal", "-shm"]) {
      fs.rmSync(live + suffix, { force: true });
    }
    fs.renameSync(path.join(staging, "gamehub.db"), live);
    restored.push("database");

    for (const dir of ["saves", "firmware", "media"] as const) {
      if (topLevel.has(dir)) {
        fs.rmSync(path.join(DATA_DIR, dir), { recursive: true, force: true });
        fs.renameSync(path.join(staging, dir), path.join(DATA_DIR, dir));
        restored.push(dir);
      }
    }
    if (topLevel.has("launchbox.db")) {
      fs.rmSync(path.join(DATA_DIR, "launchbox.db"), { force: true });
      fs.renameSync(path.join(staging, "launchbox.db"), path.join(DATA_DIR, "launchbox.db"));
      restored.push("launchbox");
    }
  } finally {
    // reopen (runs migrations forward if the backup came from an older build)
    getDb();
    fs.rmSync(staging, { recursive: true, force: true });
  }

  return { manifest, restored, files: fileCount };
}
