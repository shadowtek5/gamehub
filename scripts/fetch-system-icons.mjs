// Fetch the bundled default SYSTEM ICONS (monochrome console glyphs) shipped in
// public/system-defaults/icon/<slug>.svg — the icon counterpart to the bundled
// logos (see fetch/systemDefaultLogos). Source: RetroArch XMB "Monochrome" icon
// theme (libretro/retroarch-assets, CC-BY-4.0). Each GameHub slug maps to one
// RetroArch source SVG; systems RetroArch has no icon for reuse a sensible
// proxy (arcade cabinet for Sega arcade boards, the generic icon for camplynx,
// a same-family console otherwise). Credited in the in-app Third-Party Legal
// Notices ("Assets" group).
//
// Run:  node scripts/fetch-system-icons.mjs [--force]
// Regenerates src/lib/data/systemDefaultIcons.ts from whatever landed on disk.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "system-defaults", "icon");
const MANIFEST = path.join(ROOT, "src", "lib", "data", "systemDefaultIcons.ts");
const BASE =
  "https://raw.githubusercontent.com/libretro/retroarch-assets/master/src/xmb/monochrome";

const FORCE = process.argv.includes("--force");

// slug -> RetroArch source basename (without .svg). A `*` suffix marks a reuse
// fallback (RetroArch has no dedicated icon for that system).
const MAP = {
  "3do": "The 3DO Company - 3DO",
  "3ds": "Nintendo - Nintendo 3DS",
  acpc: "Amstrad - CPC",
  adventurevision: "Entex - Adventure Vision",
  amiga: "Commodore - Amiga",
  appleii: "Apple - II",
  arcadia2001: "Emerson - Arcadia 2001",
  archimedes: "Acorn - Archimedes",
  astrocade: "Bally - Astrocade",
  atari2600: "Atari - 2600",
  atari5200: "Atari - 5200",
  atari7800: "Atari - 7800",
  atari800: "Atari - 8-bit Family",
  atarist: "Atari - ST",
  bbcmicro: "Acorn - BBC Micro",
  c64: "Commodore - 64",
  cd32: "Commodore - CD32",
  cdi: "Non-Redump - Philips - CD-i",
  cdtv: "Commodore - CDTV",
  channelf: "Fairchild - Channel F",
  coleco: "Coleco - ColecoVision",
  dos: "DOS",
  dreamcast: "Sega - Dreamcast",
  famicom: "Nintendo - Nintendo Entertainment System",
  fds: "Nintendo - Family Computer Disk System",
  gamecube: "Nintendo - GameCube",
  gamepocket: "Epoch - Game Pocket Computer",
  gandw: "Nintendo - Game & Watch",
  gb: "Nintendo - Game Boy",
  gba: "Nintendo - Game Boy Advance",
  gbc: "Nintendo - Game Boy Color",
  genesis: "Sega - Mega Drive - Genesis",
  gg: "Sega - Game Gear",
  gx4000: "Amstrad - GX4000",
  intellivision: "Mattel - Intellivision",
  jaguar: "Atari - Jaguar",
  jaguarcd: "Atari - Jaguar CD",
  lynx: "Atari - Lynx",
  mark3: "Sega - Master System - Mark III",
  megacd: "Sega - Mega-CD - Sega CD",
  megadrive: "Sega - Mega Drive - Genesis",
  megaduck: "Welback - Mega Duck",
  msx: "Microsoft - MSX",
  msx2: "Microsoft - MSX2",
  n64: "Nintendo - Nintendo 64",
  n64dd: "Nintendo - Nintendo 64DD",
  nds: "Nintendo - Nintendo DS",
  nes: "Nintendo - Nintendo Entertainment System",
  ngp: "SNK - Neo Geo Pocket",
  odyssey2: "Magnavox - Odyssey2",
  ouya: "Ouya - Ouya",
  pce: "NEC - PC Engine - TurboGrafx 16",
  pcecd: "NEC - PC Engine CD - TurboGrafx-CD",
  pcengine: "NEC - PC Engine - TurboGrafx 16",
  pcenginecd: "NEC - PC Engine CD - TurboGrafx-CD",
  pcfx: "NEC - PC-FX",
  pokemini: "Nintendo - Pokemon Mini",
  ps2: "Sony - PlayStation 2",
  ps3: "Sony - PlayStation 3",
  psp: "Sony - PlayStation Portable",
  psx: "Sony - PlayStation",
  pv1000: "Casio - PV-1000",
  satellaview: "Nintendo - Satellaview",
  saturn: "Sega - Saturn",
  scv: "Epoch - Super Cassette Vision",
  sega32x: "Sega - 32X",
  segacd: "Sega - Mega-CD - Sega CD",
  segapico: "Sega - PICO",
  sg1000: "Sega - SG-1000",
  sms: "Sega - Master System - Mark III",
  snes: "Nintendo - Super Nintendo Entertainment System",
  sufami: "Nintendo - Sufami Turbo",
  superfamicom: "Nintendo - Super Nintendo Entertainment System",
  supergrafx: "NEC - PC Engine SuperGrafx",
  supervision8000: "Bandai - Super Vision 8000",
  switch: "Nintendo - Switch",
  triforce: "Namco, Sega, Nintendo - TriForce (Cartridges)",
  vb: "Nintendo - Virtual Boy",
  vc4000: "Interton - VC 4000",
  vectrex: "GCE - Vectrex",
  vic20: "Commodore - VIC-20",
  vita: "Sony - PlayStation Vita",
  wii: "Nintendo - Wii",
  wiiu: "Nintendo - Wii U",
  wonderswan: "Bandai - WonderSwan",
  xbox: "Microsoft - Xbox",
  xbox360: "Microsoft - Xbox 360",
  zxspectrum: "Sinclair - ZX Spectrum",

  // --- Fallbacks: no dedicated RetroArch monochrome icon ---
  pv2000: "Casio - PV-1000", //        Casio PV-2000 → PV-1000 (same family)
  wiiware: "Nintendo - Wii", //        WiiWare (not hardware) → Wii
  atomiswave: "FBNeo - Arcade Games", // Sega arcade board → arcade cabinet
  hikaru: "FBNeo - Arcade Games",
  model2: "FBNeo - Arcade Games",
  model3: "FBNeo - Arcade Games",
  naomi: "FBNeo - Arcade Games",
  naomi2: "FBNeo - Arcade Games",
  camplynx: "default", //              Camputers Lynx → RetroArch generic icon
};

// Which slugs are proxy/fallback rather than their own console icon.
const FALLBACK = new Set([
  "pv2000",
  "wiiware",
  "atomiswave",
  "hikaru",
  "model2",
  "model3",
  "naomi",
  "naomi2",
  "camplynx",
]);

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Cache one download per distinct RetroArch source (many slugs share a source).
  const cache = new Map();
  const shipped = [];
  const failed = [];

  for (const [slug, base] of Object.entries(MAP)) {
    const dest = path.join(OUT_DIR, `${slug}.svg`);
    if (!FORCE && fs.existsSync(dest)) {
      shipped.push(slug);
      continue;
    }
    try {
      let svg = cache.get(base);
      if (svg == null) {
        const url = `${BASE}/${encodeURIComponent(base)}.svg`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        svg = await res.text();
        if (!svg.includes("<svg")) throw new Error("not an SVG");
        cache.set(base, svg);
      }
      fs.writeFileSync(dest, svg, "utf8"); // UTF-8, no BOM
      shipped.push(slug);
      process.stdout.write(`. ${slug}\n`);
    } catch (e) {
      failed.push([slug, base, String(e.message || e)]);
      process.stdout.write(`X ${slug} <- ${base}: ${e.message || e}\n`);
    }
  }

  shipped.sort();
  writeManifest(shipped);

  console.log(`\nShipped ${shipped.length}/${Object.keys(MAP).length} icons.`);
  if (failed.length) {
    console.log(`FAILED (${failed.length}):`);
    for (const [s, b, e] of failed) console.log(`  ${s} <- ${b}: ${e}`);
    process.exitCode = 1;
  }
}

function writeManifest(slugs) {
  const lines = slugs
    .map((s) => `  "${s}":${" ".repeat(Math.max(1, 18 - s.length))}${FALLBACK.has(s) ? '{ fallback: true }' : "{}"},`)
    .join("\n");
  const src = `// AUTO-GENERATED by scripts/fetch-system-icons.mjs — do not edit by hand.
// Bundled default system ICONS (public/system-defaults/icon/<slug>.svg): white
// monochrome console glyphs from the RetroArch XMB "Monochrome" theme
// (libretro/retroarch-assets, CC-BY-4.0). The icon counterpart to the bundled
// logos. \`fallback: true\` = a proxy icon (RetroArch has no dedicated glyph for
// that system — e.g. Sega arcade boards reuse an arcade-cabinet icon).

export interface DefaultIcon { fallback?: boolean; }

export const SYSTEM_DEFAULT_ICONS: Record<string, DefaultIcon> = {
${lines}
};

/** Public URL of a system's bundled default icon, or null if none is shipped. */
export function defaultIconUrl(slug: string): string | null {
  return SYSTEM_DEFAULT_ICONS[slug] ? \`/system-defaults/icon/\${slug}.svg\` : null;
}
`;
  fs.writeFileSync(MANIFEST, src, "utf8");
}

main();
