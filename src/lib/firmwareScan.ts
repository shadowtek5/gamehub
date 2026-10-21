// Background job: walks a folder on the server (a BIOS / firmware collection) and
// files everything GameHub recognizes — libretro BIOS files by content hash or
// name (also inside .zip packs), and system firmware / keys packages (PS Vita
// and PS3 PUPs, Switch keys and firmware, 3DS and Wii U keys). Files are copied;
// the collection itself is never changed. Settings › Firmware › Scan a folder.

import fs from "fs";
import path from "path";
import { getSetting, setSetting } from "./db";
import { importFileFromDisk, importZip } from "./firmware";
import { matchPackageAnywhere } from "./firmwarePackages";

export const SCAN_PATH_SETTING = "firmware_scan_path";

export interface FirmwareScanStatus {
  running: boolean;
  root: string | null;
  /** files looked at / found in the folder */
  done: number;
  total: number;
  current: string;
  /** newly filed BIOS files and firmware package files */
  bios: number;
  packages: number;
  /** recognized but already in GameHub */
  already: number;
  /** "scph5501.bin → psx (verified)" — newest first, capped */
  found: string[];
  errors: string[];
  startedAt: string | null;
  finishedAt: string | null;
  cancelled: boolean;
}

interface JobState extends FirmwareScanStatus {
  cancelRequested: boolean;
}

const g = globalThis as unknown as { __firmwareScan?: JobState };

function state(): JobState {
  return (g.__firmwareScan ??= {
    running: false,
    root: null,
    done: 0,
    total: 0,
    current: "",
    bios: 0,
    packages: 0,
    already: 0,
    found: [],
    errors: [],
    startedAt: null,
    finishedAt: null,
    cancelled: false,
    cancelRequested: false,
  });
}

export function getFirmwareScanStatus(): FirmwareScanStatus & { savedPath: string | null } {
  const s = state();
  return {
    running: s.running,
    root: s.root,
    done: s.done,
    total: s.total,
    current: s.current,
    bios: s.bios,
    packages: s.packages,
    already: s.already,
    found: s.found.slice(0, 200),
    errors: s.errors.slice(0, 25),
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    cancelled: s.cancelled,
    savedPath: getSetting(SCAN_PATH_SETTING),
  };
}

export function cancelFirmwareScan(): void {
  const s = state();
  if (s.running) s.cancelRequested = true;
}

const MAX_FILES = 200_000;
const MAX_DEPTH = 12;
/** Bigger files can't be BIOS or firmware (Switch firmware zips are ~350 MB). */
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const MAX_BIOS_ZIP_BYTES = 256 * 1024 * 1024;

/** Every file under [root] (skipping hidden entries and symlinked folders). */
async function listFiles(root: string, s: JobState): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number) => {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES || s.cancelRequested) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (e) {
      s.errors.push(`${dir}: ${(e as Error).message}`);
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "System Volume Information") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full, depth + 1);
      else if (e.isFile()) out.push(full);
      if (out.length >= MAX_FILES) return;
    }
  };
  await walk(root, 0);
  return out;
}

/** Starts a scan of [root]. Returns an error message when it can't start. */
export function startFirmwareScan(root: string): string | null {
  const s = state();
  if (s.running) return "A scan is already running";
  const dir = path.resolve(root.trim());
  let ok = false;
  try {
    ok = fs.statSync(dir).isDirectory();
  } catch {
    ok = false;
  }
  if (!ok) return "That folder doesn't exist on the server (in Docker, mount it into the container first)";
  setSetting(SCAN_PATH_SETTING, dir);
  Object.assign(s, {
    running: true,
    root: dir,
    done: 0,
    total: 0,
    current: "",
    bios: 0,
    packages: 0,
    already: 0,
    found: [],
    errors: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    cancelled: false,
    cancelRequested: false,
  });
  void run(s, dir);
  return null;
}

async function run(s: JobState, root: string): Promise<void> {
  try {
    s.current = "Listing files…";
    const files = await listFiles(root, s);
    s.total = files.length;
    for (const file of files) {
      if (s.cancelRequested) break;
      const rel = path.relative(root, file);
      const base = path.basename(file);
      s.current = rel;
      try {
        const size = (await fs.promises.stat(file)).size;
        if (size === 0 || size > MAX_FILE_BYTES) continue;
        // Loose .nca files only count as Switch firmware inside a "firmware" folder (games use them too);
        // a generic "keys.txt" only counts as Wii U keys in a Cemu / Wii U folder.
        if (/\.nca$/i.test(base) && !/firmware/i.test(path.dirname(rel))) continue;
        if (/^keys\.txt$/i.test(base) && !/cemu|wii\s*u/i.test(rel)) continue;

        const isPackage = matchPackageAnywhere(base).length > 0;
        if (/\.zip$/i.test(base) && !isPackage) {
          // A BIOS pack: file whatever's inside.
          if (size > MAX_BIOS_ZIP_BYTES) continue;
          const r = await importZip("", await fs.promises.readFile(file));
          s.bios += r.imported.length;
          s.already += r.alreadyVerified.length;
          for (const i of r.imported) s.found.unshift(`${rel} › ${i.name} → ${i.slug} (${i.verified ? "verified" : "unverified"})`);
          continue;
        }
        const out = await importFileFromDisk(file, base, null, false);
        if (out.status === "bios") {
          s.bios++;
          s.found.unshift(`${rel} → ${out.slug} · ${out.filename} (${out.verified ? "verified" : "unverified"})`);
        } else if (out.status === "package") {
          s.packages++;
          s.found.unshift(`${rel} → ${out.slug} · ${out.filename}`);
        } else if (out.status === "already") {
          s.already++;
        }
        if (s.found.length > 400) s.found.length = 400;
      } catch (e) {
        if (s.errors.length < 100) s.errors.push(`${rel}: ${(e as Error).message}`);
      } finally {
        s.done++;
      }
    }
  } catch (e) {
    s.errors.push((e as Error).message);
  } finally {
    s.cancelled = s.cancelRequested;
    s.running = false;
    s.current = "";
    s.finishedAt = new Date().toISOString();
  }
}
