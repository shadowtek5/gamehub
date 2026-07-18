// Cleanup: remove games whose files disappeared (missing = 1) along with
// their favorites/collection entries and downloaded media. Shared by the
// cleanup API, the per-system tools, and auto-cleanup after scans.

import fs from "fs";
import path from "path";
import { getDb } from "./db";
import { getDataDir } from "./dataDir";

function mediaRoot() {
  return path.join(getDataDir(), "media");
}

export function orphanMediaDirs(): string[] {
  const root = mediaRoot();
  if (!fs.existsSync(root)) return [];
  const db = getDb();
  const orphans: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const romId = Number(entry.name);
    if (!Number.isInteger(romId)) continue;
    const exists = db.prepare("SELECT 1 FROM roms WHERE id = ?").get(romId);
    if (!exists) orphans.push(path.join(root, entry.name));
  }
  return orphans;
}

function missingFilter(systems: string[]): { sql: string; params: string[] } {
  if (systems.length === 0) return { sql: "", params: [] };
  return {
    sql: ` AND platform_slug IN (${systems.map(() => "?").join(",")})`,
    params: systems,
  };
}

export function countMissing(systems: string[] = []): number {
  const f = missingFilter(systems);
  return (
    getDb()
      .prepare(`SELECT COUNT(*) c FROM roms WHERE missing = 1${f.sql}`)
      .get(...f.params) as { c: number }
  ).c;
}

/** With a systems filter only those systems are touched; a full cleanup also
 *  sweeps orphaned media folders left behind by past deletions. */
export function runCleanup(systems: string[] = []): {
  removedGames: number;
  removedMediaFolders: number;
} {
  const db = getDb();
  const f = missingFilter(systems);
  const missingRows = db
    .prepare(`SELECT id FROM roms WHERE missing = 1${f.sql}`)
    .all(...f.params) as { id: number }[];
  const removeRom = db.prepare("DELETE FROM roms WHERE id = ?");
  db.transaction(() => {
    for (const row of missingRows) removeRom.run(row.id);
  })();

  let mediaRemoved = 0;
  for (const row of missingRows) {
    const dir = path.join(mediaRoot(), String(row.id));
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        mediaRemoved++;
      } catch {}
    }
  }
  if (systems.length === 0) {
    for (const dir of orphanMediaDirs()) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        mediaRemoved++;
      } catch {}
    }
  }
  return { removedGames: missingRows.length, removedMediaFolders: mediaRemoved };
}
