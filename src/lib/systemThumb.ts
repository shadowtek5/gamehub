// Pre-rendered collage images for the systems surfaces, composited server-side
// with sharp (a native image library — no browser):
//   • card.png         — the browse-card thumbnail (systems grid)
//   • hero-collage.png — the detail-page hero mosaic
// Cached under data/systems/<id>/ so each surface serves one image instead of
// dozens of live cover requests.
//
// Refresh is driven by a CONTENT FINGERPRINT: each image stores a hash of the
// ordered top covers it was built from. An image is out of date exactly when
// the current fingerprint differs from the stored one — so any change (games
// added, art scraped, ratings reordered, cleanup) is detected, independent of
// which job caused it. sharp can't do true CSS 3D perspective, so the images
// are rotated diagonal mosaics with a gentle oblique tilt.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import {
  getSystem,
  getAllSystems,
  getSystemHeroCovers,
  setSystemThumbSig,
} from "./db";
import { SYSTEMS_DIR } from "./systemStore";

type Kind = "card" | "hero";

interface KindCfg {
  file: string;
  covers: number; // how many top covers feed the image (and its fingerprint)
  tiles: number; // N×N mosaic
  squash: number; // vertical scale for the oblique tilt
  w: number;
  h: number;
}

// hero-collage.png (not hero.png — that's the scraped wallpaper) is denser and
// wider than the compact browse card.
// WebP output — photographic mosaics compress ~10× smaller than PNG, which is
// the whole point (one small image instead of many cover requests).
const KINDS: Record<Kind, KindCfg> = {
  card: { file: "card.webp", covers: 9, tiles: 3, squash: 0.82, w: 1280, h: 800 },
  hero: { file: "hero-collage.webp", covers: 48, tiles: 7, squash: 0.9, w: 2000, h: 800 },
};

const GRID = 2000; // oversized square mosaic (rotated + centre-cropped to fill)
const GAP = 12; // seam width (dark backing shows through)
const BACKING = { r: 15, g: 19, b: 26, alpha: 1 }; // #0f131a

// ---------- fingerprints & paths ----------

function sig(urls: string[]): string {
  return crypto.createHash("sha1").update(urls.join("\n")).digest("hex").slice(0, 16);
}

function thumbUrl(slug: string, kind: Kind): string | null {
  const row = getSystem(slug);
  if (!row) return null;
  const file = path.join(SYSTEMS_DIR, String(row.id), KINDS[kind].file);
  try {
    const st = fs.statSync(file);
    return `/api/systems/media/${row.id}/${KINDS[kind].file}?v=${Math.round(st.mtimeMs)}`;
  } catch {
    return null;
  }
}

/** Cached browse-card thumbnail URL, or null (caller falls back to live collage). */
export function getCardThumbUrl(slug: string): string | null {
  return thumbUrl(slug, "card");
}

/** Cached detail-page hero collage URL, or null (caller falls back to live collage). */
export function getHeroCollageUrl(slug: string): string | null {
  return thumbUrl(slug, "hero");
}

function urlsToLocalPaths(urls: string[]): string[] {
  const out: string[] = [];
  for (const url of urls) {
    if (!url.startsWith("/api/media/")) continue;
    const rel = url.replace(/^\/api\/media\//, "").split("?")[0];
    const p = path.join(process.cwd(), "data", "media", ...rel.split("/"));
    if (fs.existsSync(p)) out.push(p);
  }
  return out;
}

// ---------- rendering ----------

async function buildImage(coverPaths: string[], cfg: KindCfg): Promise<Buffer> {
  const N = cfg.tiles;
  const CELL = Math.floor((GRID - GAP * (N + 1)) / N);
  const tiles = await Promise.all(
    Array.from({ length: N * N }, (_, i) =>
      sharp(coverPaths[i % coverPaths.length])
        .resize(CELL, CELL, { fit: "cover", position: "attention" })
        .modulate({ saturation: 1.16 })
        .toBuffer()
    )
  );
  const composites = tiles.map((input, i) => ({
    input,
    left: GAP + (i % N) * (CELL + GAP),
    top: GAP + Math.floor(i / N) * (CELL + GAP),
  }));
  const mosaic = await sharp({
    create: { width: GRID, height: GRID, channels: 4, background: BACKING },
  })
    .composite(composites)
    .png()
    .toBuffer();

  // Rotate to diagonal slices, squash vertically for a gentle 2.5D tilt.
  const rotated = await sharp(mosaic)
    .rotate(-45, { background: BACKING })
    .affine([[1, 0], [0, cfg.squash]], { background: BACKING })
    .toBuffer();

  // Crop the largest centred rectangle (at the output aspect) that stays inside
  // the rotated mosaic's diamond, so the empty corners never show.
  const m = await sharp(rotated).metadata();
  const W = m.width ?? GRID;
  const H = m.height ?? GRID;
  const aspect = cfg.w / cfg.h;
  const cw = Math.floor(0.92 / (1 / W + 1 / (aspect * H)));
  const ch = Math.floor(cw / aspect);
  return sharp(rotated)
    .extract({
      left: Math.floor((W - cw) / 2),
      top: Math.floor((H - ch) / 2),
      width: cw,
      height: ch,
    })
    .resize(cfg.w, cfg.h)
    .webp({ quality: 80 })
    .toBuffer();
}

/** (Re)generate one image for a system and record its fingerprint. Systems with
 *  no covers get the image cleared (surfaces fall back to the live collage).
 *  Best-effort — returns false on render failure (fingerprint left unchanged so
 *  it retries next pass). */
async function regenerate(slug: string, kind: Kind, newSig: string): Promise<boolean> {
  const row = getSystem(slug);
  if (!row) return false;
  const cfg = KINDS[kind];
  const file = path.join(SYSTEMS_DIR, String(row.id), cfg.file);
  const coverPaths = urlsToLocalPaths(getSystemHeroCovers(slug, cfg.covers));

  if (coverPaths.length === 0) {
    try {
      fs.rmSync(file, { force: true });
    } catch {}
    setSystemThumbSig(slug, kind, newSig); // remember (empty) inputs; don't retry
    return true;
  }
  try {
    const png = await buildImage(coverPaths, cfg);
    await fs.promises.mkdir(path.join(SYSTEMS_DIR, String(row.id)), { recursive: true });
    await fs.promises.writeFile(file, png);
    setSystemThumbSig(slug, kind, newSig);
    return true;
  } catch {
    return false;
  }
}

/** Build BOTH collages (card + hero) for a system from a hand-picked set of cover
 *  URLs. These are the "custom collage" — they overwrite the auto ones and are
 *  protected from the drift-refresh (see refreshDriftedThumbs). Returns false when
 *  no cover resolves to a local file. */
export async function buildCustomCollages(slug: string, coverUrls: string[]): Promise<boolean> {
  const row = getSystem(slug);
  if (!row) return false;
  const coverPaths = urlsToLocalPaths(coverUrls);
  if (coverPaths.length === 0) return false;
  await fs.promises.mkdir(path.join(SYSTEMS_DIR, String(row.id)), { recursive: true });
  for (const kind of ["card", "hero"] as Kind[]) {
    const cfg = KINDS[kind];
    const png = await buildImage(coverPaths, cfg);
    await fs.promises.writeFile(path.join(SYSTEMS_DIR, String(row.id), cfg.file), png);
  }
  return true;
}

// ---------- fingerprint-driven refresh ----------

const busy = globalThis as unknown as { __ghThumbBusy?: boolean };

/** Does the cached collage file for this system exist on disk? */
function thumbFileExists(id: number, kind: Kind): boolean {
  try {
    return fs.statSync(path.join(SYSTEMS_DIR, String(id), KINDS[kind].file)).isFile();
  } catch {
    return false;
  }
}

/**
 * Regenerate collage images that are out of date, optionally limited to a set of
 * slugs. A collage is rebuilt when its content fingerprint drifted OR its cached
 * file is missing (so deleting data/systems self-heals on the next refresh), or
 * unconditionally when `force` is set (a full rebuild). One pass at a time.
 */
export async function refreshDriftedThumbs(
  limitTo?: string[],
  hooks?: { isCancelled?: () => boolean; onProgress?: (done: number, total: number, current: string) => void },
  force = false
): Promise<{ done: number; skipped?: boolean }> {
  if (busy.__ghThumbBusy) return { done: 0, skipped: true };
  busy.__ghThumbBusy = true;
  const only = limitTo ? new Set(limitTo) : null;
  const systems = getAllSystems().filter((r) => !only || only.has(r.slug));
  let done = 0;
  let processed = 0;
  try {
    for (const row of systems) {
      if (hooks?.isCancelled?.()) break;
      // Hand-picked custom collages are never auto-overwritten (not even on force).
      if (row.custom_thumb) {
        processed++;
        continue;
      }
      hooks?.onProgress?.(processed, systems.length, row.slug);
      const checks: [Kind, string | null][] = [
        ["card", row.card_thumb_sig],
        ["hero", row.hero_thumb_sig],
      ];
      for (const [kind, stored] of checks) {
        const current = sig(getSystemHeroCovers(row.slug, KINDS[kind].covers));
        const stale = force || current !== stored || !thumbFileExists(row.id, kind);
        if (stale && (await regenerate(row.slug, kind, current))) {
          done++;
        }
      }
      processed++;
      hooks?.onProgress?.(processed, systems.length, "");
    }
  } finally {
    busy.__ghThumbBusy = false;
  }
  return { done };
}

// ---------- thumb-refresh job (queued, for the downloads page) ----------

export interface ThumbJobStatus {
  running: boolean;
  total: number;
  done: number;
  updated: number;
  current: string;
  cancelled: boolean;
  startedAt: string | null;
  finishedAt: string | null;
}
type ThumbJobState = ThumbJobStatus & { cancelRequested: boolean };
const thumbJob = globalThis as unknown as { __thumbJob?: ThumbJobState };
function thumbState(): ThumbJobState {
  if (!thumbJob.__thumbJob) {
    thumbJob.__thumbJob = {
      running: false, total: 0, done: 0, updated: 0, current: "",
      cancelled: false, startedAt: null, finishedAt: null, cancelRequested: false,
    };
  }
  return thumbJob.__thumbJob;
}

export function getThumbJobStatus(): ThumbJobStatus {
  const { cancelRequested: _c, ...view } = thumbState();
  void _c;
  return view;
}

export function cancelThumbJob(): boolean {
  const s = thumbState();
  if (!s.running) return false;
  s.cancelRequested = true;
  return true;
}

/** Manual, queue-driven collage refresh with progress (whole library or a
 *  subset of systems). `force` rebuilds every collage regardless of fingerprint. */
export function startThumbRefreshJob(systems?: string[], onComplete?: () => void, force = false): boolean {
  const s = thumbState();
  if (s.running) {
    onComplete?.();
    return false;
  }
  Object.assign(s, {
    running: true, total: 0, done: 0, updated: 0, current: "",
    cancelled: false, cancelRequested: false,
    startedAt: new Date().toISOString(), finishedAt: null,
  });
  void (async () => {
    try {
      const r = await refreshDriftedThumbs(
        systems?.length ? systems : undefined,
        {
          isCancelled: () => s.cancelRequested,
          onProgress: (done, total, current) => {
            s.done = done;
            s.total = total;
            s.current = current;
          },
        },
        force
      );
      s.updated = r.done;
      if (s.cancelRequested) s.cancelled = true;
    } finally {
      s.running = false;
      s.current = "";
      s.finishedAt = new Date().toISOString();
      onComplete?.();
    }
  })();
  return true;
}
