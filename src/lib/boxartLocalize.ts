// Box-art localizer. GameHub must NEVER serve a live scraper URL to the browser
// — box art is downloaded once and stored locally. The scanner used to stash a
// *guessed* thumbnails.libretro.com URL straight into roms.boxart_url (never
// downloaded, often a 404), so most of the library was hotlinking full-size PNGs
// off libretro on every browse. This job downloads each such cover into
// data/media/<id>/boxart.webp and rewrites boxart_url to the local /api/media
// path; a URL that 404s (libretro doesn't have that game) is cleared to NULL so
// nothing keeps hotlinking a dead link.

import fs from "fs";
import path from "path";
import { getDb } from "./db";
import { saveMedia } from "./providers/mediaSave";
import { imageExt } from "./media";
import { platformBySlug } from "./platforms";
import { libretroBoxartUrl, libretroBoxartUrlFromTitle } from "./boxart";
import { ensureThumb, GRID_THUMB_WIDTHS } from "./mediaThumbGen";

const LIBRETRO_PREFIX = "https://thumbnails.libretro.com/";
const UA = "GameHub/0.1 (self-hosted ROM library; box-art localizer)";
const CONCURRENCY = 8;

export function isLibretroUrl(url: string | null | undefined): url is string {
  return !!url && url.startsWith(LIBRETRO_PREFIX);
}

function mediaDir(romId: number): string {
  return path.join(process.cwd(), "data", "media", String(romId));
}
function localMediaUrl(romId: number, file: string): string {
  return `/api/media/${romId}/${file}?v=${Date.now()}`;
}

/** Local disk path backing a /api/media/<id>/<file> URL, or null if not local. */
function localSourcePath(url: string): string | null {
  if (!url.startsWith("/api/media/")) return null;
  const rel = url.replace(/^\/api\/media\//, "").split("?")[0];
  return path.join(process.cwd(), "data", "media", ...rel.split("/"));
}

/** Pre-build the small grid thumbnails so first views never pay the resize. */
async function warmThumbs(sourcePath: string): Promise<void> {
  for (const w of GRID_THUMB_WIDTHS) await ensureThumb(sourcePath, w);
}

interface TargetRow {
  id: number;
  filename: string | null;
  title: string | null;
  platform_slug: string;
  boxart_url: string | null;
}

/** Where do we fetch this row's cover from? An already-stored libretro URL is
 *  used as-is; a row with no art gets a freshly-computed libretro candidate. */
function sourceUrls(row: TargetRow): string[] {
  if (isLibretroUrl(row.boxart_url)) return [row.boxart_url];
  const platform = platformBySlug(row.platform_slug);
  if (!platform) return [];
  const urls: string[] = [];
  if (row.filename) urls.push(libretroBoxartUrl(platform, row.filename));
  if (row.title) {
    const byTitle = libretroBoxartUrlFromTitle(platform, row.title);
    if (!urls.includes(byTitle)) urls.push(byTitle);
  }
  return urls;
}

type FetchResult = { buf?: Buffer; notFound?: boolean; transient?: boolean };

/** Fetch bytes, distinguishing a definitive 404 (drop the link) from a transient
 *  failure (429/5xx/network — leave the link, try again next run). */
async function fetchArt(url: string): Promise<FetchResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
        headers: { "User-Agent": UA },
      });
      if (res.status === 404) return { notFound: true };
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length ? { buf } : { notFound: true };
    } catch {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return { transient: true };
}

type Outcome = "localized" | "optimized" | "cleared" | "failed";

async function processRow(row: TargetRow): Promise<Outcome> {
  // Already-local art: just make sure the small grid thumbnails exist (converts
  // existing covers to the fast WebP thumbnails without re-downloading).
  const localPath = row.boxart_url ? localSourcePath(row.boxart_url) : null;
  if (localPath) {
    if (!fs.existsSync(localPath)) return "failed";
    await warmThumbs(localPath);
    return "optimized";
  }

  // Otherwise download from libretro (a stored URL, or a computed candidate for
  // a game the scanner left art-less), store it locally, and warm its thumbnails.
  const urls = sourceUrls(row);
  if (urls.length === 0) return "failed";

  let sawNotFound = false;
  for (const url of urls) {
    const res = await fetchArt(url);
    if (res.buf) {
      const dir = mediaDir(row.id);
      const file = await saveMedia(res.buf, dir, "boxart", imageExt(res.buf));
      if (!file) return "failed";
      getDb().prepare("UPDATE roms SET boxart_url = ? WHERE id = ?").run(localMediaUrl(row.id, file), row.id);
      await warmThumbs(path.join(dir, file));
      return "localized";
    }
    if (res.notFound) sawNotFound = true;
    else if (res.transient) return "failed"; // leave the URL, retry next run
  }

  // Every candidate 404'd. Drop a stored dead libretro link so nothing hotlinks
  // it again; a row that was already NULL just stays NULL.
  if (sawNotFound && isLibretroUrl(row.boxart_url)) {
    getDb().prepare("UPDATE roms SET boxart_url = NULL WHERE id = ? AND boxart_url = ?").run(row.id, row.boxart_url);
  }
  return "cleared";
}

// ---------- background job state (survives navigation on globalThis) ----------

export interface BoxartLocalizeStatus {
  running: boolean;
  total: number;
  processed: number;
  localized: number;
  optimized: number;
  cleared: number;
  failed: number;
  cancelled: boolean;
  startedAt: string | null;
  finishedAt: string | null;
}

type JobState = BoxartLocalizeStatus & { cancel: boolean };
const g = globalThis as unknown as { __boxartLocalize?: JobState };

function state(): JobState {
  if (!g.__boxartLocalize) {
    g.__boxartLocalize = {
      running: false, total: 0, processed: 0, localized: 0, optimized: 0, cleared: 0,
      failed: 0, cancelled: false, startedAt: null, finishedAt: null, cancel: false,
    };
  }
  return g.__boxartLocalize;
}

export function getBoxartLocalizeStatus(): BoxartLocalizeStatus {
  const { cancel: _cancel, ...view } = state();
  void _cancel;
  return view;
}

export function cancelBoxartLocalize(): void {
  const s = state();
  if (s.running) s.cancel = true;
}

/** Localize a set of rows with a bounded worker pool. */
async function runLocalize(rows: TargetRow[]): Promise<void> {
  const s = state();
  Object.assign(s, {
    running: true, total: rows.length, processed: 0, localized: 0, optimized: 0, cleared: 0,
    failed: 0, cancelled: false, cancel: false,
    startedAt: new Date().toISOString(), finishedAt: null,
  });
  let idx = 0;
  async function worker() {
    while (idx < rows.length) {
      if (s.cancel) return;
      const row = rows[idx++];
      try {
        s[await processRow(row)]++;
      } catch {
        s.failed++;
      }
      s.processed++;
    }
  }
  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (s.cancel) s.cancelled = true;
  } finally {
    s.running = false;
    s.cancel = false;
    s.finishedAt = new Date().toISOString();
  }
}

/** Optimize the whole library's box art: download every cover still stored as a
 *  live libretro URL into local storage, and (re)build the small grid thumbnails
 *  for covers already stored locally. Runs in the background; returns the count. */
export function startBoxartLocalizeAll(systems?: string[], onDone?: () => void): { started: boolean; total: number } {
  if (state().running) {
    onDone?.();
    return { started: false, total: state().total };
  }
  const plat = systems?.length
    ? ` AND platform_slug IN (${systems.map(() => "?").join(",")})`
    : "";
  const rows = getDb()
    .prepare(
      `SELECT id, filename, title, platform_slug, boxart_url FROM roms
       WHERE missing = 0
         AND (boxart_url LIKE '${LIBRETRO_PREFIX}%' OR boxart_url LIKE '/api/media/%')${plat}`
    )
    .all(...(systems?.length ? systems : [])) as TargetRow[];
  // fire-and-forget; progress via getBoxartLocalizeStatus, onDone pumps the queue
  runLocalize(rows).finally(() => onDone?.());
  return { started: true, total: rows.length };
}

/** Localize art for a specific set of ROM ids (e.g. the games a scan just added,
 *  whose boxart_url is NULL — we compute the libretro candidate for each). */
export async function localizeBoxartForIds(ids: number[]): Promise<void> {
  if (ids.length === 0 || state().running) return;
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT id, filename, title, platform_slug, boxart_url FROM roms
       WHERE missing = 0 AND boxart_url IS NULL AND id IN (${placeholders})`
    )
    .all(...ids) as TargetRow[];
  await runLocalize(rows);
}
