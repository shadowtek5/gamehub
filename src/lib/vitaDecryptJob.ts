// Background job: decrypts raw PS Vita NoNpDRM zips in the library (see vitaPfs.ts) so clients can
// install them into Vita3K by plain extraction. The decrypted zip replaces the original in place —
// same path and file name — only after it has been fully written. One game at a time, cancellable.
// Runs through the job queue: manually from Maintenance, or after scans when "vita_auto_decrypt" is on.

import fs from "fs";
import path from "path";
import { getDb, getSetting } from "./db";
import { dataPath } from "./dataDir";
import { decryptNoNpDrmZip, detectNoNpDrm, findPfsdec, readSfos, readZipEntries, zipEntryNames } from "./vitaPfs";
import { forgetAddons, scheduleAddonScan } from "./addons";

/**
 * A game's license, for decrypting its update: the work.bin (raw or decrypted game zips keep it)
 * or license/<TITLE_ID>/*.rif (installed layout) of a PS Vita zip holding that game.
 */
async function gameLicense(titleId: string, exceptId: number): Promise<Buffer | null> {
  const rows = getDb()
    .prepare(
      `SELECT r.id, r.path FROM roms r LEFT JOIN rom_addons ra ON ra.rom_id = r.id
        WHERE r.platform_slug = ? AND r.missing = 0 AND r.id != ? AND lower(r.path) LIKE '%.zip'
          AND ((ra.kind = 'base' AND ra.base_key = ?) OR upper(r.path) LIKE ?)
          AND COALESCE(ra.kind, '') NOT IN ('update', 'dlc', 'license')
        ORDER BY (ra.kind = 'base') DESC`
    )
    .all(VITA_SLUG, exceptId, titleId, `%${titleId}%`) as { id: number; path: string }[];
  for (const row of rows) {
    try {
      const found = await readZipEntries(
        row.path,
        (n) => /(?:^|\/)sce_sys\/package\/work\.bin$/i.test(n) || new RegExp(`(?:^|/)license/${titleId}/[^/]+\\.rif$`, "i").test(n),
        64 * 1024
      );
      for (const rif of found.values()) {
        // The license must be for this game: its content id names the title ("UP0001-PCSE00120_00-…").
        if (rif.length >= 0x34 && rif.toString("latin1", 0x17, 0x20).toUpperCase() === titleId) return rif;
      }
    } catch {
      /* unreadable */
    }
  }
  return null;
}

export const VITA_SLUG = "vita";
export const AUTO_DECRYPT_SETTING = "vita_auto_decrypt";

export interface VitaDecryptJobStatus {
  running: boolean;
  total: number;
  done: number;
  decrypted: number;
  /** zips that were already decrypted / not NoNpDRM dumps */
  skipped: number;
  current: string;
  /** what's happening to the current game: extract / decrypt / zip (with %) */
  phase: string;
  errors: string[];
  startedAt: string | null;
  finishedAt: string | null;
  cancelled: boolean;
}

interface JobState extends VitaDecryptJobStatus {
  cancelRequested: boolean;
  signal: { kill?: () => void };
}

const g = globalThis as unknown as { __vitaDecryptJob?: JobState };

function state(): JobState {
  if (!g.__vitaDecryptJob) {
    g.__vitaDecryptJob = {
      running: false,
      total: 0,
      done: 0,
      decrypted: 0,
      skipped: 0,
      current: "",
      phase: "",
      errors: [],
      startedAt: null,
      finishedAt: null,
      cancelled: false,
      cancelRequested: false,
      signal: {},
    };
  }
  return g.__vitaDecryptJob;
}

export function getVitaDecryptJobStatus(): VitaDecryptJobStatus {
  const s = state();
  return {
    running: s.running,
    total: s.total,
    done: s.done,
    decrypted: s.decrypted,
    skipped: s.skipped,
    current: s.current,
    phase: s.phase,
    errors: s.errors.slice(0, 25),
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    cancelled: s.cancelled,
  };
}

export function cancelVitaDecryptJob(): void {
  const s = state();
  if (!s.running) return;
  s.cancelRequested = true;
  s.signal.kill?.();
}

export function isAutoDecryptOn(): boolean {
  return getSetting(AUTO_DECRYPT_SETTING) === "on";
}

interface Row {
  id: number;
  path: string;
  title: string;
}

/** PS Vita .zip ROMs (optionally only these ids) that are on disk. */
function candidates(ids?: number[]): Row[] {
  const byId = ids?.length ? ` AND id IN (${ids.map(() => "?").join(",")})` : "";
  return getDb()
    .prepare(
      `SELECT id, path, title FROM roms
       WHERE missing = 0 AND platform_slug = ? AND lower(path) LIKE '%.zip'${byId} ORDER BY title`
    )
    .all(VITA_SLUG, ...(ids ?? [])) as Row[];
}

/** Of these (newly scanned) ROM ids, the PS Vita zips — used to chain a decrypt after scans. */
export function vitaZipIds(ids: number[]): number[] {
  if (!ids.length) return [];
  return candidates(ids).map((r) => r.id);
}

/** Decrypts NoNpDRM dumps among the PS Vita zips (all, or just `ids`). */
export function startVitaDecryptJob(ids?: number[], onComplete?: () => void): boolean {
  const s = state();
  const tool = findPfsdec();
  if (s.running || !tool) {
    if (!tool) s.errors = ["vita-pfsdec isn't installed on this server"];
    onComplete?.();
    return false;
  }
  const rows = candidates(ids);
  Object.assign(s, {
    running: true,
    total: rows.length,
    done: 0,
    decrypted: 0,
    skipped: 0,
    current: "",
    phase: "",
    errors: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    cancelled: false,
    cancelRequested: false,
    signal: {},
  });

  const update = getDb().prepare(
    "UPDATE roms SET size_bytes = ?, crc32 = NULL, md5 = NULL, sha1 = NULL WHERE id = ?"
  );

  void (async () => {
    try {
      for (const row of rows) {
        if (s.cancelRequested) break;
        s.current = row.title;
        s.phase = "";
        try {
          const names = await zipEntryNames(row.path);
          const layout = detectNoNpDrm(names, await readSfos(row.path, names).catch(() => undefined));
          if (!layout) {
            s.skipped++;
          } else {
            const dir = path.dirname(row.path);
            try {
              fs.accessSync(dir, fs.constants.W_OK);
            } catch {
              throw new Error("the ROM folder is read-only");
            }
            // Written next to the original (same filesystem) so the swap is an atomic rename.
            const tmp = path.join(dir, `.${path.basename(row.path)}.decrypting`);
            // An update is decrypted with its game's license.
            const licenseFile = path.join(dir, `.${path.basename(row.path)}.license`);
            if (layout.needsGameLicense) {
              const rif = await gameLicense(layout.needsGameLicense, row.id);
              if (!rif) throw new Error(`update for ${layout.needsGameLicense}: its game (with its license) isn't in the library, so it can't be decrypted yet`);
              fs.writeFileSync(licenseFile, rif);
            }
            try {
              await decryptNoNpDrmZip(row.path, layout, tmp, dataPath("tmp", "vita-decrypt", String(row.id)), {
                tool,
                license: layout.needsGameLicense ? licenseFile : undefined,
                isCancelled: () => s.cancelRequested,
                signal: s.signal,
                onPhase: (phase, pct) => {
                  s.phase = pct === undefined ? phase : `${phase} ${pct}%`;
                },
              });
              fs.renameSync(tmp, row.path);
            } finally {
              fs.rmSync(tmp, { force: true });
              fs.rmSync(licenseFile, { force: true });
            }
            forgetAddons([row.id]);
            update.run(fs.statSync(row.path).size, row.id);
            s.decrypted++;
            console.log(`[vita-decrypt] decrypted ${row.title} (${row.path})`);
          }
        } catch (e) {
          if (!s.cancelRequested && s.errors.length < 25) {
            s.errors.push(`${row.title}: ${e instanceof Error ? e.message : e}`);
          }
        }
        s.done++;
      }
      if (s.cancelRequested) s.cancelled = true;
    } finally {
      // The rewritten zips are looked at again (what's inside, which game they belong to).
      if (s.decrypted) scheduleAddonScan(true);
      s.running = false;
      s.current = "";
      s.phase = "";
      s.finishedAt = new Date().toISOString();
      onComplete?.();
    }
  })();
  return true;
}
