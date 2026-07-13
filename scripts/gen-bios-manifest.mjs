// Generates src/lib/biosManifest.ts from The RetroBIOS Project's RetroArch
// mapping (Abdess/retrobios platforms/retroarch.yml — the libretro System.dat
// set). We use only metadata (core-expected filename + hashes); GameHub never
// ships BIOS files. Re-run to refresh:  node scripts/gen-bios-manifest.mjs
//
// Everything in retroarch.yml is flagged required:true (it means "known file"),
// so "required" here is decided per-SYSTEM from REQUIRED_SYSTEMS below (whether
// a console needs a BIOS at all), not per-file.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const SRC_URL = "https://raw.githubusercontent.com/Abdess/retrobios/main/platforms/retroarch.yml";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "src", "lib", "biosManifest.ts");
const LOCAL_FALLBACK = process.argv[2]; // optional local retroarch.yml path

// retrobios system key -> GameHub platform slug(s). Split JP/western GameHub
// slugs point at the same source system.
const SLUG_MAP = {
  "sony-playstation": ["psx"],
  "sony-playstation-2": ["ps2"],
  "sony-psp": ["psp"],
  "sega-mega-cd": ["segacd", "megacd"],
  "sega-saturn": ["saturn"],
  "sega-dreamcast": ["dreamcast"],
  "sega-dreamcast-arcade": ["naomi", "atomiswave"],
  "nec-pc-engine": ["pcecd", "pcenginecd"],
  "nec-pc-fx": ["pcfx"],
  "nintendo-fds": ["fds"],
  "nintendo-gba": ["gba"],
  "nintendo-gb": ["gb"],
  "nintendo-gbc": ["gbc"],
  "nintendo-ds": ["nds"],
  "nintendo-gamecube": ["gamecube"],
  "nintendo-64dd": ["n64dd"],
  "nintendo-nes": ["nes"],
  "nintendo-satellaview": ["satellaview"],
  "nintendo-sufami-turbo": ["sufami"],
  "atari-lynx": ["lynx"],
  "atari-5200": ["atari5200"],
  "atari-7800": ["atari7800"],
  "atari-400-800": ["atari800"],
  "atari-st": ["atarist"],
  "3do": ["3do"],
  "coleco-colecovision": ["coleco"],
  "mattel-intellivision": ["intellivision"],
  "magnavox-odyssey2": ["odyssey2"],
  "philips-videopac": ["odyssey2"],
  "fairchild-channel-f": ["channelf"],
  "snk-neogeo-cd": ["neogeocd"],
  arcade: ["arcade", "neogeo"],
  "microsoft-msx": ["msx", "msx2"],
  "commodore-amiga": ["amiga"],
  "amstrad-cpc": ["acpc"],
  "sega-game-gear": ["gg"],
  "sega-master-system": ["sms", "mark3"],
  "sinclair-zx-spectrum": ["zxspectrum"],
  dos: ["dos"],
};

// GameHub slugs whose core will not boot / is unusable without a BIOS. Anything
// mapped but not listed here is treated as OPTIONAL (BIOS enhances or is only
// needed for some titles).
const REQUIRED_SYSTEMS = new Set([
  "psx", "ps2", "saturn", "segacd", "megacd", "pcecd", "pcenginecd", "neogeocd",
  "neogeo", "3do", "fds", "pcfx", "naomi", "atomiswave", "amiga", "atarist",
  "coleco", "intellivision", "odyssey2", "channelf", "atari5200", "msx", "msx2",
  "n64dd",
]);

// Region derivation from the core-expected filename. Curated exact-name hints
// for the multi-regional consoles; otherwise a light heuristic; else "World".
const REGION_EXACT = {
  // PlayStation
  "scph5500.bin": "Japan", "scph5501.bin": "USA", "scph5502.bin": "Europe",
  "scph1000.bin": "Japan", "scph1001.bin": "USA", "scph1002.bin": "Europe",
  "scph7001.bin": "USA", "scph7002.bin": "Europe", "scph7003.bin": "USA",
  "scph7502.bin": "Europe", "scph101.bin": "USA", "scph5000.bin": "Japan",
  "scph3000.bin": "Japan", "scph3500.bin": "Japan",
  // Sega CD / Mega CD
  "bios_cd_u.bin": "USA", "bios_cd_e.bin": "Europe", "bios_cd_j.bin": "Japan",
  // Saturn
  "sega_101.bin": "Japan", "mpr-17933.bin": "USA", "mpr-17740.bin": "Japan",
  "mpr-18811-mx.ic1": "Japan", "mpr-19367-mx.ic1": "Japan",
  // 3DO
  "panafz1.bin": "Japan", "panafz10.bin": "USA", "panafz10e-anvil.bin": "Europe",
  "goldstar.bin": "Asia", "sanyotry.bin": "Japan",
  // Neo Geo CD
  "neocd_f.rom": "Europe", "neocd_sf.rom": "Japan", "neocd_z.rom": "USA",
};
const region = (fileName) => {
  const f = fileName.toLowerCase();
  if (REGION_EXACT[f]) return REGION_EXACT[f];
  if (/\b(usa|_u\b|\(u\))/.test(f)) return "USA";
  if (/\b(japan|jpn|_j\b|\(j\))/.test(f)) return "Japan";
  if (/\b(europe|_e\b|\(e\)|pal)/.test(f)) return "Europe";
  return "World";
};

function loadYaml() {
  if (LOCAL_FALLBACK && fs.existsSync(LOCAL_FALLBACK)) {
    return yaml.load(fs.readFileSync(LOCAL_FALLBACK, "utf8"));
  }
  throw new Error("pass a local retroarch.yml path as argv[2], or use --fetch");
}

async function main() {
  let doc;
  if (process.argv.includes("--fetch")) {
    const res = await fetch(SRC_URL);
    if (!res.ok) throw new Error(`fetch ${SRC_URL} -> ${res.status}`);
    doc = yaml.load(await res.text());
  } else {
    doc = loadYaml();
  }
  const systems = doc.systems || {};

  // gameHub slug -> Map<destination, BiosFile> (dedupe, later source wins ties)
  const out = {};
  for (const [srcKey, targets] of Object.entries(SLUG_MAP)) {
    const sys = systems[srcKey];
    if (!sys || !Array.isArray(sys.files) || sys.files.length === 0) continue;
    for (const slug of targets) {
      out[slug] ||= new Map();
      for (const f of sys.files) {
        const dest = String(f.destination || f.name || "").trim();
        if (!dest) continue;
        out[slug].set(dest, {
          file: dest,
          md5: String(f.md5 || "").toLowerCase(),
          sha1: String(f.sha1 || "").toLowerCase(),
          size: Number(f.size || 0),
          region: region(dest),
          description: String(f.description || "").trim(),
        });
      }
    }
  }

  const slugs = Object.keys(out).sort();
  const body = slugs
    .map((slug) => {
      const files = [...out[slug].values()].sort((a, b) => a.file.localeCompare(b.file));
      const required = REQUIRED_SYSTEMS.has(slug);
      const lines = files
        .map(
          (b) =>
            `    { file: ${JSON.stringify(b.file)}, md5: ${JSON.stringify(b.md5)}, sha1: ${JSON.stringify(b.sha1)}, size: ${b.size}, region: ${JSON.stringify(b.region)}, description: ${JSON.stringify(b.description)} },`
        )
        .join("\n");
      return `  ${JSON.stringify(slug)}: {\n    required: ${required},\n    files: [\n${lines}\n    ],\n  },`;
    })
    .join("\n");

  const ts = `// AUTO-GENERATED by scripts/gen-bios-manifest.mjs — do not edit by hand.
// Source: The RetroBIOS Project (Abdess/retrobios) RetroArch/libretro System.dat.
// Only metadata (core-expected filename + verified hashes) is embedded; GameHub
// never distributes BIOS files.

export type BiosRegion = "World" | "USA" | "Japan" | "Europe" | "Asia" | "Other";

export interface BiosFile {
  /** exact filename the libretro core looks for in its system dir */
  file: string;
  md5: string;
  sha1: string;
  size: number;
  region: BiosRegion;
  description: string;
}

export interface BiosSystem {
  /** true when the console will not run without a BIOS (else BIOS is optional) */
  required: boolean;
  files: BiosFile[];
}

/** Per GameHub platform slug → the BIOS files that console can use. Systems that
 *  need no BIOS are absent. */
export const BIOS_MANIFEST: Record<string, BiosSystem> = {
${body}
};

/** All hashes → the system+file they identify, for matching uploads by content. */
export interface BiosMatch { slug: string; file: BiosFile; }
const BY_HASH: Record<string, BiosMatch> = (() => {
  const m: Record<string, BiosMatch> = {};
  for (const [slug, sys] of Object.entries(BIOS_MANIFEST)) {
    for (const file of sys.files) {
      if (file.sha1) m["sha1:" + file.sha1] = { slug, file };
      if (file.md5) m["md5:" + file.md5] = { slug, file };
    }
  }
  return m;
})();

/** Identify an uploaded file by content hash (sha1 preferred, md5 fallback). */
export function matchBiosByHash(hashes: { sha1?: string; md5?: string }): BiosMatch | null {
  if (hashes.sha1 && BY_HASH["sha1:" + hashes.sha1.toLowerCase()]) return BY_HASH["sha1:" + hashes.sha1.toLowerCase()];
  if (hashes.md5 && BY_HASH["md5:" + hashes.md5.toLowerCase()]) return BY_HASH["md5:" + hashes.md5.toLowerCase()];
  return null;
}
`;

  fs.writeFileSync(OUT, ts);
  const totalFiles = slugs.reduce((n, s) => n + out[s].size, 0);
  console.log(`wrote ${OUT}`);
  console.log(`${slugs.length} systems, ${totalFiles} bios files`);
  console.log("systems:", slugs.join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
