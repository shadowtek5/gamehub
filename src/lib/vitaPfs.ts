// PS Vita NoNpDRM decryption. A raw NoNpDRM dump (eboot.bin, sce_sys/, sce_pfs/ + the fake license
// sce_sys/package/work.bin) is still PFS-encrypted: only Vita3K's own installer can decrypt it, and
// Vita3K on Android can't be driven by other apps. This decrypts it server-side with vita-pfsdec
// (tools/vita-pfsdec — Vita3K's psvpfsparser, offline keys), producing exactly what Vita3K's
// installer writes to ux0/app/<TITLE_ID>/. work.bin is kept in the output (sce_sys/package/) because
// eboot.bin stays a retail SELF that needs the license at runtime; clients install it into
// ux0/license/<TITLE_ID>/<CONTENT_ID>.rif.

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import yauzl from "yauzl";
import { zipDirectory } from "./zipWrite";

const PARAM_SFO = "sce_sys/param.sfo";
const WORK_BIN = "sce_sys/package/work.bin";

/** Absolute path of the vita-pfsdec tool, or null when it isn't installed. */
export function findPfsdec(): string | null {
  const exe = process.platform === "win32" ? "vita-pfsdec.exe" : "vita-pfsdec";
  const candidates = [
    process.env.GAMEHUB_VITA_PFSDEC?.trim(),
    "/usr/local/bin/vita-pfsdec",
    ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean).map((d) => path.join(d, exe)),
  ].filter((p): p is string => !!p);
  return candidates.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }) ?? null;
}

export interface NoNpDrmLayout {
  /** folder inside the zip holding the game ("" = zip root, else "PCSE01168/") */
  root: string;
}

/**
 * Detects a raw NoNpDRM dump from a zip's entry names: the folder holding the shallowest
 * sce_sys/param.sfo must also contain sce_pfs/ and sce_sys/package/work.bin. Already-decrypted
 * zips (no sce_pfs) and anything else return null.
 */
export function detectNoNpDrm(names: string[]): NoNpDrmLayout | null {
  const paths = names.map((n) => n.replace(/\\/g, "/"));
  const lower = paths.map((p) => p.toLowerCase());
  const sfo = lower
    .filter((p) => p.endsWith(PARAM_SFO) && (p.length === PARAM_SFO.length || p[p.length - PARAM_SFO.length - 1] === "/"))
    .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  if (sfo === undefined) return null;
  const rootLower = sfo.slice(0, sfo.length - PARAM_SFO.length);
  const hasPfs = lower.some((p) => p.startsWith(`${rootLower}sce_pfs/`));
  const hasLicense = lower.includes(rootLower + WORK_BIN);
  if (!hasPfs || !hasLicense) return null;
  // Keep the zip's own casing for the root folder.
  const i = lower.indexOf(sfo);
  return { root: paths[i].slice(0, rootLower.length) };
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) => (err || !zip ? reject(err ?? new Error("can't open zip")) : resolve(zip)))
  );
}

/** Entry names of a zip (reads only its central directory). */
export async function zipEntryNames(file: string): Promise<string[]> {
  const zip = await openZip(file);
  try {
    return await new Promise<string[]>((resolve, reject) => {
      const names: string[] = [];
      zip.on("entry", (e: yauzl.Entry) => {
        names.push(e.fileName);
        zip.readEntry();
      });
      zip.on("end", () => resolve(names));
      zip.on("error", reject);
      zip.readEntry();
    });
  } finally {
    try { zip.close(); } catch {}
  }
}

/** Extracts the entries under `root` into `dest` (root stripped). Rejects unsafe paths. */
async function extractRoot(file: string, root: string, dest: string, isCancelled: () => boolean): Promise<void> {
  const zip = await openZip(file);
  const rootLower = root.toLowerCase();
  const destAbs = path.resolve(dest);
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", () => resolve());
      zip.on("entry", (entry: yauzl.Entry) => {
        if (isCancelled()) return reject(new Error("cancelled"));
        const name = entry.fileName.replace(/\\/g, "/");
        if (!name.toLowerCase().startsWith(rootLower)) return zip.readEntry();
        const rel = name.slice(root.length);
        if (!rel) return zip.readEntry();
        const out = path.resolve(destAbs, rel);
        if (out !== destAbs && !out.startsWith(destAbs + path.sep)) return reject(new Error(`unsafe path in zip: ${name}`));
        if (rel.endsWith("/")) {
          fs.mkdirSync(out, { recursive: true });
          return zip.readEntry();
        }
        fs.mkdirSync(path.dirname(out), { recursive: true });
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) return reject(err ?? new Error(`can't read ${name}`));
          const ws = fs.createWriteStream(out);
          stream.on("error", reject);
          ws.on("error", reject);
          ws.on("finish", () => zip.readEntry());
          stream.pipe(ws);
        });
      });
      zip.readEntry();
    });
  } finally {
    try { zip.close(); } catch {}
  }
}

/** Runs vita-pfsdec; resolves on exit code 0, rejects with the tail of its output otherwise. */
function runPfsdec(tool: string, src: string, dst: string, license: string, signal: { kill?: () => void }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, [src, dst, license], { stdio: ["ignore", "pipe", "pipe"] });
    signal.kill = () => child.kill();
    let tail = "";
    const keep = (b: Buffer) => {
      tail = (tail + b.toString("utf8")).slice(-2000);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    // A large game decrypts in seconds to a few minutes; this only catches a hang.
    const timer = setTimeout(() => child.kill(), 60 * 60 * 1000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal.kill = undefined;
      if (code === 0) resolve();
      else reject(new Error(`vita-pfsdec failed (exit ${code}): ${tail.trim().split("\n").slice(-3).join(" | ")}`));
    });
  });
}

function freeBytes(dir: string): number | null {
  try {
    const s = fs.statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** True if eboot.bin is a SELF ("SCE" + NUL) or ELF — i.e. no longer PFS-encrypted. */
function isLoadableExecutable(file: string): boolean {
  const fd = fs.openSync(file, "r");
  try {
    const b = Buffer.alloc(4);
    fs.readSync(fd, b, 0, 4, 0);
    return b.equals(Buffer.from([0x53, 0x43, 0x45, 0x00])) || b.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Decrypts a NoNpDRM zip into a new zip at `destZip` (game files at the zip root, sce_pfs removed,
 * work.bin kept). `workDir` is scratch space (needs ~2x the zip size); it is removed afterwards.
 */
export async function decryptNoNpDrmZip(
  zipPath: string,
  layout: NoNpDrmLayout,
  destZip: string,
  workDir: string,
  opts: { tool: string; isCancelled?: () => boolean; onPhase?: (phase: "extract" | "decrypt" | "zip", pct?: number) => void; signal?: { kill?: () => void } }
): Promise<void> {
  const isCancelled = opts.isCancelled ?? (() => false);
  const size = fs.statSync(zipPath).size;
  fs.mkdirSync(workDir, { recursive: true });
  const free = freeBytes(workDir);
  if (free !== null && free < size * 2.1) {
    throw new Error(`not enough free space for decrypting (${Math.round(size * 2.1 / 1e9)} GB needed in ${workDir})`);
  }
  const destFree = freeBytes(path.dirname(destZip));
  if (destFree !== null && destFree < size * 1.05) {
    throw new Error(`not enough free space next to the ROM (${Math.round(size / 1e9)} GB needed)`);
  }
  const src = path.join(workDir, "src");
  const out = path.join(workDir, "out");
  try {
    fs.rmSync(src, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
    opts.onPhase?.("extract");
    await extractRoot(zipPath, layout.root, src, isCancelled);
    if (isCancelled()) throw new Error("cancelled");

    opts.onPhase?.("decrypt");
    const license = path.join(src, ...WORK_BIN.split("/"));
    await runPfsdec(opts.tool, src, out, license, opts.signal ?? {});
    if (isCancelled()) throw new Error("cancelled");

    const eboot = path.join(out, "eboot.bin");
    if (!fs.existsSync(eboot) || !isLoadableExecutable(eboot) || fs.existsSync(path.join(out, "sce_pfs"))) {
      throw new Error("decrypted output doesn't look right (eboot.bin still encrypted or missing)");
    }
    // vita-pfsdec only writes files listed in the PFS; keep the license next to the game.
    const licenseOut = path.join(out, ...WORK_BIN.split("/"));
    fs.mkdirSync(path.dirname(licenseOut), { recursive: true });
    fs.copyFileSync(license, licenseOut);
    fs.rmSync(src, { recursive: true, force: true });

    opts.onPhase?.("zip", 0);
    await zipDirectory(out, destZip, {
      isCancelled,
      onProgress: (d, t) => opts.onPhase?.("zip", t ? Math.round((d / t) * 100) : 0),
    });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
