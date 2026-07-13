// Automated (scheduled) backups. Reuses the streaming tar builder from
// backup.ts, but writes to a .tar FILE under a configured directory instead of
// to an HTTP download, then prunes to a retention count. Config + status live
// in the settings table so they survive restarts and show in the downloads
// "Scheduled" list and the Automation settings panel.

import fs from "fs";
import path from "path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getSetting, setSetting } from "./db";
import { streamBackupTar, type BackupParts } from "./backup";

const DATA_DIR = path.join(process.cwd(), "data");
const DEFAULT_DIR = path.join(DATA_DIR, "backups");
const DEFAULT_PARTS: BackupParts = { saves: true, firmware: true, media: false, launchbox: true };

export interface BackupConfig {
  enabled: boolean;
  intervalHours: number;
  dir: string;
  keep: number;
  parts: BackupParts;
}

export function getBackupConfig(): BackupConfig {
  let parts = DEFAULT_PARTS;
  const raw = getSetting("backup_parts");
  if (raw) {
    try {
      parts = { ...DEFAULT_PARTS, ...(JSON.parse(raw) as Partial<BackupParts>) };
    } catch {
      /* keep defaults */
    }
  }
  const interval = Number(getSetting("backup_interval_hours"));
  const keep = Number(getSetting("backup_keep"));
  return {
    enabled: getSetting("backup_auto") === "on",
    intervalHours: Number.isFinite(interval) && interval > 0 ? interval : 24,
    dir: getSetting("backup_dir")?.trim() || DEFAULT_DIR,
    keep: Number.isFinite(keep) && keep > 0 ? Math.min(100, Math.round(keep)) : 7,
    parts,
  };
}

export function setBackupConfig(patch: Partial<BackupConfig>): BackupConfig {
  if (patch.enabled !== undefined) setSetting("backup_auto", patch.enabled ? "on" : "off");
  if (patch.intervalHours !== undefined)
    setSetting("backup_interval_hours", String(Math.max(1, Math.round(patch.intervalHours))));
  if (patch.dir !== undefined) setSetting("backup_dir", patch.dir.trim() || DEFAULT_DIR);
  if (patch.keep !== undefined)
    setSetting("backup_keep", String(Math.max(1, Math.min(100, Math.round(patch.keep)))));
  if (patch.parts !== undefined) setSetting("backup_parts", JSON.stringify(patch.parts));
  return getBackupConfig();
}

export interface BackupFile {
  name: string;
  size: number;
  mtime: string;
}

/** Existing backup archives in the configured dir, newest first. */
export function listBackups(dir = getBackupConfig().dir): BackupFile[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".tar"))
      .map((e) => {
        const st = fs.statSync(path.join(dir, e.name));
        return { name: e.name, size: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
  } catch {
    return [];
  }
}

const g = globalThis as unknown as { __autoBackup?: { running: boolean } };
function st() {
  if (!g.__autoBackup) g.__autoBackup = { running: false };
  return g.__autoBackup;
}

export interface BackupStatus extends BackupConfig {
  running: boolean;
  lastAt: string | null;
  lastError: string | null;
  nextAt: string | null;
  backups: BackupFile[];
}

export function getBackupStatus(): BackupStatus {
  const cfg = getBackupConfig();
  const lastAt = getSetting("last_backup_at") || null;
  const nextAt =
    cfg.enabled && lastAt
      ? new Date(Date.parse(lastAt) + cfg.intervalHours * 3_600_000).toISOString()
      : null;
  return {
    ...cfg,
    running: st().running,
    lastAt,
    lastError: getSetting("backup_last_error") || null,
    nextAt,
    backups: listBackups(cfg.dir),
  };
}

function prune(dir: string, keep: number) {
  const files = listBackups(dir);
  for (const f of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(dir, f.name));
    } catch {
      /* best-effort */
    }
  }
}

/** Run one backup now (config-driven). Writes a timestamped .tar and prunes.
 *  Guarded so two runs never overlap. Returns the created filename or throws. */
export async function runBackupNow(): Promise<{ file: string; size: number }> {
  const s = st();
  if (s.running) throw new Error("A backup is already running");
  const cfg = getBackupConfig();
  s.running = true;
  setSetting("backup_last_error", "");
  try {
    fs.mkdirSync(cfg.dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const dest = path.join(cfg.dir, `gamehub-backup-${stamp}.tar`);
    const { stream } = await streamBackupTar(cfg.parts);
    await pipeline(Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(dest));
    const size = fs.statSync(dest).size;
    setSetting("last_backup_at", new Date().toISOString());
    prune(cfg.dir, cfg.keep);
    return { file: path.basename(dest), size };
  } catch (e) {
    setSetting("backup_last_error", e instanceof Error ? e.message : String(e));
    throw e;
  } finally {
    s.running = false;
  }
}

/** For the scheduler: run a backup iff enabled, due, and not already running. */
export async function maybeRunScheduledBackup(): Promise<void> {
  const cfg = getBackupConfig();
  if (!cfg.enabled || st().running) return;
  const last = getSetting("last_backup_at");
  if (last && Date.now() - Date.parse(last) < cfg.intervalHours * 3_600_000 - 60_000) return;
  await runBackupNow().catch((e) => console.error("[auto-backup] failed:", e));
}
