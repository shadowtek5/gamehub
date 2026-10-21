// PS Vita NoNpDRM decryption. A raw NoNpDRM dump (eboot.bin, sce_sys/, sce_pfs/ + the fake license
// sce_sys/package/work.bin) is still PFS-encrypted: only Vita3K's own installer can decrypt it, and
// Vita3K on Android can't be driven by other apps. This decrypts it server-side with vita-pfsdec
// (tools/vita-pfsdec — Vita3K's psvpfsparser, offline keys), producing exactly what Vita3K's
// installer writes to ux0/app/<TITLE_ID>/. work.bin is kept in the output (sce_sys/package/) because
// eboot.bin stays a retail SELF that needs the license at runtime; clients install it into
// ux0/license/<TITLE_ID>/<CONTENT_ID>.rif.
//
// Updates and DLC are PFS-encrypted too, and are decrypted the way Vita3K's installer does it: a DLC
// (param.sfo CATEGORY "ac") with its own work.bin, an update (CATEGORY "gp") with its game's license.
// Their output keeps the installed layout — patch/<TITLE_ID>/ or addcont/<TITLE_ID>/<DLC>/ (plus the
// DLC's license/<TITLE_ID>/<CONTENT_ID>.rif) — so clients copy them into ux0 as they are.

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import yauzl from "yauzl";
import { zipDirectory } from "./zipWrite";

const PARAM_SFO = "sce_sys/param.sfo";
const WORK_BIN = "sce_sys/package/work.bin";

/**
 * Absolute path of the vita-pfsdec tool, or null when it isn't installed. Looked up in
 * GAMEHUB_VITA_PFSDEC, the running release's bin/ (self-update bundles ship it there — Next's
 * server.js chdir()s into the release), the Docker image's /usr/local/bin, then PATH.
 */
export function findPfsdec(): string | null {
  const exe = process.platform === "win32" ? "vita-pfsdec.exe" : "vita-pfsdec";
  const bundled = path.join(process.cwd(), "bin", exe);
  const candidates = [
    process.env.GAMEHUB_VITA_PFSDEC?.trim(),
    bundled,
    "/usr/local/bin/vita-pfsdec",
    ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean).map((d) => path.join(d, exe)),
  ].filter((p): p is string => !!p);
  for (const p of candidates) {
    try {
      if (!fs.statSync(p).isFile()) continue;
    } catch {
      continue;
    }
    if (process.platform === "win32") return p;
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {
      // The update bundle's zip doesn't keep the executable bit; restore it on our own copy.
      if (p === bundled) {
        try {
          fs.chmodSync(p, 0o755);
          return p;
        } catch {}
      }
    }
  }
  return null;
}

/** One PFS-encrypted part of a dump: a game, an update or a DLC. */
export interface NoNpDrmUnit {
  /** its folder inside the zip ("" = zip root, "PCSE01168/", "addcont/PCSE00120/P4GDLC0001/") */
  root: string;
  kind: "app" | "patch" | "addcont";
  titleId: string;
  /** where it goes in the output: "" = the zip root (a lone game), else "app/<ID>/", "patch/<ID>/", "addcont/<ID>/<DLC>/" */
  installPath: string;
  /** has its own work.bin (games and DLC need one; updates use their game's) */
  hasLicense: boolean;
}

export interface NoNpDrmLayout {
  /** every encrypted part in the zip — e.g. several DLC in one package */
  units: NoNpDrmUnit[];
  /** an update whose game isn't in the same zip: its title id (its license comes from the library) */
  needsGameLicense: string | null;
}

/** What a dump's param.sfo says (CATEGORY gd / gp / ac, TITLE_ID, CONTENT_ID, TITLE, APP_VER). */
export interface SfoInfo {
  category: string;
  titleId: string;
  contentId: string | null;
  title?: string | null;
  appVer?: string | null;
}

/** Every sce_sys/param.sfo in a zip, by the (lower-case) folder holding it. */
export async function readSfos(file: string, names: string[]): Promise<Map<string, SfoInfo>> {
  const wanted = new Set(
    names
      .map((n) => n.replace(/\\/g, "/"))
      .filter((n) => /(?:^|\/)sce_sys\/param\.sfo$/i.test(n))
      .slice(0, 256)
  );
  const out = new Map<string, SfoInfo>();
  if (!wanted.size) return out;
  for (const [name, raw] of await readZipEntries(file, (n) => wanted.has(n), 64 * 1024)) {
    out.set(name.slice(0, name.length - PARAM_SFO.length).toLowerCase(), {
      category: (sfoValue(raw, "CATEGORY") ?? "").toLowerCase(),
      titleId: (sfoValue(raw, "TITLE_ID") ?? "").toUpperCase(),
      contentId: sfoValue(raw, "CONTENT_ID"),
      title: sfoValue(raw, "TITLE"),
      appVer: sfoValue(raw, "APP_VER"),
    });
  }
  return out;
}

/** Reads a string value from a param.sfo. */
export function sfoValue(b: Buffer, wanted: string): string | null {
  if (b.length < 20 || b.toString("latin1", 1, 4) !== "PSF") return null;
  const keyTable = b.readUInt32LE(8);
  const dataTable = b.readUInt32LE(12);
  const count = b.readUInt32LE(16);
  for (let i = 0; i < count; i++) {
    const e = 20 + i * 16;
    if (e + 16 > b.length) break;
    const k = keyTable + b.readUInt16LE(e);
    const end = b.indexOf(0, k);
    if (b.toString("latin1", k, end) === wanted) {
      const at = dataTable + b.readUInt32LE(e + 12);
      return b.toString("utf8", at, at + b.readUInt32LE(e + 4)).replace(/\0+$/, "").trim() || null;
    }
  }
  return null;
}

/**
 * Finds the PFS-encrypted parts of a raw NoNpDRM zip from its entry names: every folder holding
 * sce_pfs/. [sfos] (readSfos) tells a game, update and DLC apart; without it the folder layout
 * (app/, patch/, addcont/<ID>/<DLC>/) does. Games and DLC need their own sce_sys/package/work.bin;
 * an update uses its game's. Already-decrypted zips (no sce_pfs) and anything else return null.
 */
export function detectNoNpDrm(names: string[], sfos?: Map<string, SfoInfo>): NoNpDrmLayout | null {
  const paths = names.map((n) => n.replace(/\\/g, "/"));
  const lower = paths.map((p) => p.toLowerCase());
  const has = new Set(lower);
  const roots = new Map<string, string>();
  lower.forEach((l, i) => {
    const k = l.indexOf("sce_pfs/");
    if (k >= 0 && (k === 0 || l[k - 1] === "/") && !roots.has(l.slice(0, k))) roots.set(l.slice(0, k), paths[i].slice(0, k));
  });
  const units: NoNpDrmUnit[] = [];
  for (const [rootLower, root] of roots) {
    const info = sfos?.get(rootLower);
    const inApp = /(?:^|\/)app\/(PCS[A-Z]\d{5})\/$/i.exec(root);
    const inPatch = /(?:^|\/)patch\/(PCS[A-Z]\d{5})\/$/i.exec(root);
    const inAddcont = /(?:^|\/)addcont\/(PCS[A-Z]\d{5})\/([^/]+)\/$/i.exec(root);
    const category = info?.category || (inPatch ? "gp" : inAddcont ? "ac" : "gd");
    const titleId = (info?.titleId || inApp?.[1] || inPatch?.[1] || inAddcont?.[1] || /(PCS[A-Z]\d{5})/i.exec(root)?.[1] || "").toUpperCase();
    const hasLicense = has.has(rootLower + WORK_BIN);
    if (!titleId) continue;
    if (category.startsWith("gp")) {
      units.push({ root, kind: "patch", titleId, installPath: `patch/${titleId}/`, hasLicense });
    } else if (category === "ac") {
      const dlc = inAddcont?.[2] ?? (info?.contentId && info.contentId.length > 20 ? info.contentId.slice(20) : "");
      if (dlc && hasLicense) units.push({ root, kind: "addcont", titleId, installPath: `addcont/${titleId}/${dlc}/`, hasLicense });
    } else if (hasLicense && has.has(rootLower + PARAM_SFO)) {
      units.push({ root, kind: "app", titleId, installPath: `app/${titleId}/`, hasLicense });
    }
  }
  if (!units.length) return null;
  // A lone game keeps the layout it always had: its files at the zip root.
  if (units.length === 1 && units[0].kind === "app") units[0].installPath = "";
  const patch = units.find((u) => u.kind === "patch" && !units.some((a) => a.kind === "app" && a.titleId === u.titleId));
  return { units, needsGameLicense: patch?.titleId ?? null };
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

/** Reads the (small) entries [wanted] picks out of a zip, by entry name. Bigger ones are skipped. */
export async function readZipEntries(file: string, wanted: (name: string) => boolean, maxBytes = 1024 * 1024): Promise<Map<string, Buffer>> {
  const zip = await openZip(file);
  const out = new Map<string, Buffer>();
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", () => resolve());
      zip.on("entry", (entry: yauzl.Entry) => {
        const name = entry.fileName.replace(/\\/g, "/");
        if (name.endsWith("/") || !wanted(name) || entry.uncompressedSize > maxBytes) return zip.readEntry();
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) return reject(err ?? new Error(`can't read ${name}`));
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("error", reject);
          stream.on("end", () => {
            out.set(name, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  } finally {
    try { zip.close(); } catch {}
  }
  return out;
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
 * Decrypts a NoNpDRM zip into a new zip at `destZip`, sce_pfs removed. A lone game keeps its files at
 * the zip root with work.bin; anything else (updates, DLC — several in one package — or a game with
 * them) comes out in Vita3K's installed layout: app/<ID>/, patch/<ID>/, addcont/<ID>/<DLC>/, plus
 * license/<ID>/<CONTENT_ID>.rif for games and DLC. Files outside the encrypted parts are kept as they
 * are. `workDir` is scratch space (needs ~2x the zip size); it is removed afterwards.
 */
export async function decryptNoNpDrmZip(
  zipPath: string,
  layout: NoNpDrmLayout,
  destZip: string,
  workDir: string,
  opts: {
    tool: string;
    isCancelled?: () => boolean;
    onPhase?: (phase: "extract" | "decrypt" | "zip", pct?: number) => void;
    signal?: { kill?: () => void };
    /** an update's game license (its work.bin / .rif) when the game isn't in the same zip */
    license?: string;
  }
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
  const lone = layout.units.length === 1 && layout.units[0].installPath === "";
  try {
    fs.rmSync(src, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
    opts.onPhase?.("extract");
    await extractRoot(zipPath, lone ? layout.units[0].root : "", src, isCancelled);
    if (isCancelled()) throw new Error("cancelled");

    const unitDir = (u: NoNpDrmUnit) => (lone ? src : path.join(src, ...u.root.split("/").filter(Boolean)));
    const writeRif = (titleId: string, rif: Buffer) => {
      const contentId = rif.toString("latin1", 0x10, 0x34).replace(/\0[\s\S]*$/, "");
      if (!contentId) return;
      const dir = path.join(out, "license", titleId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${contentId}.rif`), rif);
    };
    for (const [i, u] of layout.units.entries()) {
      opts.onPhase?.("decrypt", layout.units.length > 1 ? Math.round((i / layout.units.length) * 100) : undefined);
      const dir = unitDir(u);
      // An update uses its game's license: from the same zip, else the one found in the library.
      const game = layout.units.find((a) => a.kind === "app" && a.titleId === u.titleId);
      const license = u.kind === "patch" ? (game ? path.join(unitDir(game), ...WORK_BIN.split("/")) : opts.license) : path.join(dir, ...WORK_BIN.split("/"));
      if (!license || !fs.existsSync(license)) throw new Error(`the update for ${u.titleId} needs its game's license (add the game first)`);
      const target = u.installPath ? path.join(out, ...u.installPath.split("/").filter(Boolean)) : out;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await runPfsdec(opts.tool, dir, target, license, opts.signal ?? {});
      if (isCancelled()) throw new Error("cancelled");

      const eboot = path.join(target, "eboot.bin");
      if (fs.existsSync(path.join(target, "sce_pfs"))) throw new Error("decrypted output still has sce_pfs");
      if (u.kind === "app" && (!fs.existsSync(eboot) || !isLoadableExecutable(eboot))) {
        throw new Error("decrypted output doesn't look right (eboot.bin still encrypted or missing)");
      }
      if (u.kind === "patch" && fs.existsSync(eboot) && !isLoadableExecutable(eboot)) {
        throw new Error("decrypted update doesn't look right (eboot.bin still encrypted)");
      }
      if (u.kind === "addcont" && !fs.readdirSync(target).length) throw new Error(`decrypted DLC ${u.installPath} is empty`);
      if (u.kind === "app" && lone) {
        // vita-pfsdec only writes files listed in the PFS; keep the license next to the game.
        const licenseOut = path.join(out, ...WORK_BIN.split("/"));
        fs.mkdirSync(path.dirname(licenseOut), { recursive: true });
        fs.copyFileSync(license, licenseOut);
      } else if (u.kind !== "patch") {
        // Where Vita3K's installer puts licenses: license/<TITLE_ID>/<CONTENT_ID>.rif.
        writeRif(u.titleId, fs.readFileSync(license));
      }
    }
    if (!lone) {
      // Everything outside the encrypted parts (already-decrypted folders, licenses…) stays as it is.
      const unitRoots = layout.units.map((u) => u.root.toLowerCase());
      const copyRest = (dir: string, rel: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) {
            if (!unitRoots.includes(`${r}/`.toLowerCase())) copyRest(path.join(dir, e.name), r);
          } else {
            const dest = path.join(out, ...r.split("/"));
            if (!fs.existsSync(dest)) {
              fs.mkdirSync(path.dirname(dest), { recursive: true });
              fs.copyFileSync(path.join(dir, e.name), dest);
            }
          }
        }
      };
      copyRest(src, "");
    }
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
