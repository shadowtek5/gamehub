import path from "path";

// Absolute location of GameHub's writable data folder (SQLite db, scraped
// media, saves, firmware, backups, and — for the self-update mechanism —
// staged app releases under data/app/…).
//
// This MUST be resolved from an absolute env var rather than
// `process.cwd()/data`, because Next.js's standalone `server.js` calls
// `process.chdir(__dirname)` on boot. When the in-app updater runs a staged
// release from `/app/data/app/<version>/`, the cwd becomes that folder — so a
// cwd-relative data path would silently repoint the database and media into
// the staged release and lose everything. GAMEHUB_DATA_DIR (set by
// docker-entrypoint.sh to /app/data) pins it regardless of cwd.
//
// Native / dev installs don't set the env var and keep the historical
// `<cwd>/data` behaviour.
const RESOLVED_DATA_DIR =
  process.env.GAMEHUB_DATA_DIR && process.env.GAMEHUB_DATA_DIR.trim()
    ? path.resolve(process.env.GAMEHUB_DATA_DIR.trim())
    : path.join(process.cwd(), "data");

/** Absolute path to GameHub's data directory (…/data). */
export function getDataDir(): string {
  return RESOLVED_DATA_DIR;
}

/** Convenience: join sub-paths onto the data directory. */
export function dataPath(...segments: string[]): string {
  return path.join(RESOLVED_DATA_DIR, ...segments);
}
