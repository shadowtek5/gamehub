import { getDb, getSetting, getLibraryPaths } from "./db";

/** Fresh install? True until the wizard finishes (or anything is configured
 *  already — existing installations never see the wizard). */
export function needsSetup(): boolean {
  if (getSetting("setup_complete") === "on") return false;
  const db = getDb();
  const folders = (db.prepare("SELECT COUNT(*) c FROM system_folders").get() as { c: number }).c;
  if (folders > 0) return false;
  const roms = (db.prepare("SELECT COUNT(*) c FROM roms").get() as { c: number }).c;
  if (roms > 0) return false;
  return getLibraryPaths().length === 0;
}
