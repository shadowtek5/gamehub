// Generates the PWA / home-screen icons from an inline SVG (a game controller
// on GameHub's dark tile). Run: node scripts/gen-pwa-icons.mjs
// Outputs to public/icons/. Re-run if the mark/colors change.

import sharp from "sharp";
import fs from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(OUT, { recursive: true });

const BG = "#0e141b";
const ACCENT = "#1a9fff";

// Filled controller glyph in a 24×24 space (same motif used in the app chrome).
const CONTROLLER = `<path fill="${BG}" fill-rule="evenodd" d="M6 8a4 4 0 0 0-4 4v2a3 3 0 0 0 5.8 1.1L8.6 14h6.8l.8 1.1A3 3 0 0 0 22 14v-2a4 4 0 0 0-4-4H6Zm1 2.5h1.5V12H10v1.5H8.5V15H7v-1.5H5.5V12H7v-1.5Zm9.5.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm2 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>`;

// glyph is centred on (12,12.5) in the 24-space; place it on a 512 canvas.
const place = (s) => `translate(${256 - 12 * s},${256 - 12.5 * s}) scale(${s})`;

// `full` = maskable/apple (bg fills the whole square, glyph in the safe zone);
// otherwise a rounded tile with the glyph on an accent disc.
function svg(size, { full = false } = {}) {
  const s = full ? 13 : 14;
  const disc = full ? "" : `<circle cx="256" cy="256" r="180" fill="${ACCENT}"/>`;
  const glyphFill = full ? ACCENT : BG;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="${full ? 0 : 96}" fill="${BG}"/>
    ${disc}
    <g transform="${place(s)}" fill="${glyphFill}">${CONTROLLER.replace(`fill="${BG}"`, `fill="${glyphFill}"`)}</g>
  </svg>`;
}

async function png(markup, size, file) {
  await sharp(Buffer.from(markup)).png().toFile(path.join(OUT, file));
  console.log("wrote", file);
}

await png(svg(192), 192, "icon-192.png");
await png(svg(512), 512, "icon-512.png");
await png(svg(512, { full: true }), 512, "icon-maskable-512.png");
await png(svg(180, { full: true }), 180, "apple-touch-icon.png");
console.log("PWA icons done");
