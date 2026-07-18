import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getDataDir } from "../dataDir";

// Read-only accessor for the standalone cheat database (data/cheats.db), built
// from a RetroArch/libretro cheat dump by scripts/import-cheats.mjs. Absent DB
// is fine — the catalog just falls back to its small built-in seed list.

const globalCheats = globalThis as unknown as { __cheatsDb?: Database.Database | null };

export function cheatsDb(): Database.Database | null {
  if (globalCheats.__cheatsDb !== undefined) return globalCheats.__cheatsDb;
  const file = path.join(getDataDir(), "cheats.db");
  if (!fs.existsSync(file)) {
    globalCheats.__cheatsDb = null;
    return null;
  }
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    db.pragma("query_only = true");
    globalCheats.__cheatsDb = db;
    return db;
  } catch {
    globalCheats.__cheatsDb = null;
    return null;
  }
}

/** Cheats from the imported DB for a platform + normalised title (capped). */
export function dbCheats(
  platformSlug: string,
  titleNorm: string,
  limit = 200
): { name: string; code: string }[] {
  const db = cheatsDb();
  if (!db) return [];
  try {
    return db
      .prepare(
        `SELECT name, code FROM cheat_defs
         WHERE platform = ? AND title_norm = ?
         ORDER BY name LIMIT ?`
      )
      .all(platformSlug, titleNorm, limit) as { name: string; code: string }[];
  } catch {
    return [];
  }
}
