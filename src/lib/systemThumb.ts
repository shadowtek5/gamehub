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
  sampleSystemBoxart,
  setSystemThumbSig,
  setSystemBoxLayoutAuto,
  type BoxLayout,
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

// ---------- box-art shape auto-detection ----------

// Classify from a measured width/height ratio. Thresholds match GameCard's
// documented buckets: >1.15 landscape, 0.85–1.15 squarish, else tall.
function classifyAspect(ratio: number): BoxLayout {
  if (ratio > 1.15) return "wide";
  if (ratio >= 0.85) return "square";
  return "portrait";
}

/** Measure a system's scraped box art and store the detected shape as its
 *  box_layout_auto (the value used whenever box_layout is 'auto'). Uses the
 *  median aspect of the top covers so one odd scan can't skew it. No-ops when
 *  there aren't enough real covers to measure. */
export async function detectBoxLayout(slug: string): Promise<BoxLayout | null> {
  // Measure BOX ART specifically (not hero/screenshot, which are landscape and
  // would wrongly read as "wide").
  const coverPaths = urlsToLocalPaths(sampleSystemBoxart(slug, 16));
  if (coverPaths.length < 3) return null; // too few to trust — keep the built-in
  const ratios: number[] = [];
  for (const p of coverPaths) {
    try {
      const m = await sharp(p).metadata();
      if (m.width && m.height) ratios.push(m.width / m.height);
    } catch {}
  }
  if (ratios.length < 3) return null;
  ratios.sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)];
  const layout = classifyAspect(median);
  setSystemBoxLayoutAuto(slug, layout);
  return layout;
}

// ---------- fingerprint-driven refresh ----------

const busy = globalThis as unknown as { __ghThumbBusy?: boolean };

/**
 * Regenerate every collage image whose content fingerprint has drifted from what
 * was last rendered, optionally limited to a set of slugs (e.g. the systems a
 * scan/scrape just touched; omit for the whole library). One pass at a time.
 */
export async function refreshDriftedThumbs(
  limitTo?: string[]
): Promise<{ done: number; skipped?: boolean }> {
  if (busy.__ghThumbBusy) return { done: 0, skipped: true };
  busy.__ghThumbBusy = true;
  const only = limitTo ? new Set(limitTo) : null;
  let done = 0;
  try {
    for (const row of getAllSystems()) {
      if (only && !only.has(row.slug)) continue;
      const checks: [Kind, string | null][] = [
        ["card", row.card_thumb_sig],
        ["hero", row.hero_thumb_sig],
      ];
      for (const [kind, stored] of checks) {
        const current = sig(getSystemHeroCovers(row.slug, KINDS[kind].covers));
        if (current !== stored && (await regenerate(row.slug, kind, current))) {
          done++;
          // The card kind's covers changing means this system's art set changed
          // — re-measure the auto box shape from the same covers.
          if (kind === "card") await detectBoxLayout(row.slug);
        }
      }
    }
  } finally {
    busy.__ghThumbBusy = false;
  }
  return { done };
}
