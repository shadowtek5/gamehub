// Import a RetroArch/libretro cheat database (folder of per-game .cht files,
// grouped by system) into a standalone SQLite DB at data/cheats.db, which
// GameHub's prebuilt-cheat catalog queries at runtime.
//
// Usage:  node scripts/import-cheats.mjs "C:\\path\\to\\Cores+Cheats\\cheats"
//         node scripts/import-cheats.mjs            (defaults to the path below)
//
// Safe to re-run: it rebuilds data/cheats.db from scratch each time.

import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const DEFAULT_SRC = "C:\\Users\\jason\\Downloads\\Cores+Cheats\\cheats";
const srcRoot = process.argv[2] || DEFAULT_SRC;
const outDb = path.join(process.cwd(), "data", "cheats.db");

// RetroArch system folder -> GameHub platform slug. Folders not listed here
// (game engines, unsupported systems) are skipped. Core-named folders map to
// the same slug as their system; duplicate cheats are deduped by UNIQUE index.
const SYSTEM_MAP = {
  "Atari - 400-800-1200XL": "atari800",
  "Atari - 5200": "atari5200",
  "Atari - 7800": "atari7800",
  "Coleco - ColecoVision": "coleco",
  DOS: "dos",
  "FBNeo - Arcade Games": "arcade",
  "Microsoft - MSX - MSX2 - MSX2P - MSX Turbo R": "msx",
  "NEC - PC Engine - TurboGrafx 16": "pce",
  "NEC - PC Engine CD - TurboGrafx-CD": "pcecd",
  "Nintendo - Family Computer Disk System": "nes",
  "Nintendo - Game Boy": "gb",
  "Nintendo - Game Boy Advance": "gba",
  "Nintendo - Game Boy Color": "gbc",
  "Nintendo - Nintendo 64": "n64",
  "Nintendo - Nintendo DS": "nds",
  "Nintendo - Nintendo Entertainment System": "nes",
  "Nintendo - Satellaview": "satellaview",
  "Nintendo - Super Nintendo Entertainment System": "snes",
  "Sega - 32X": "sega32x",
  "Sega - Dreamcast": "dreamcast",
  "Sega - Game Gear": "gg",
  "Sega - Master System - Mark III": "sms",
  "Sega - Mega Drive - Genesis": "genesis",
  "Sega - Mega-CD - Sega CD": "segacd",
  "Sega - Saturn": "saturn",
  "Sinclair - ZX Spectrum +3": "zxspectrum",
  "Sony - PlayStation": "psx",
  "Beetle PSX": "psx",
  "PCSX-ReARMed": "psx",
  bsnes: "snes",
  "bsnes HD": "snes",
};

// MUST match normTitle() in src/lib/cheats/catalog.ts so titles line up at
// runtime. Drops bracketed tags and leading/trailing articles (the/a/an), then
// strips to alphanumerics so "Legend of Zelda, The" == "The Legend of Zelda".
function normTitle(title) {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\ba\b/g, " ")
    .replace(/\ban\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

// A cleaner display title: filename minus extension and trailing (…)/[…] tags.
function displayTitle(fileBase) {
  return fileBase
    .replace(/\.cht$/i, "")
    .replace(/\s*[([][^)\]]*[)\]]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCht(text) {
  const descs = {};
  const codes = {};
  const re = /cheat(\d+)_(desc|code)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[2] === "desc") descs[m[1]] = m[3];
    else codes[m[1]] = m[3];
  }
  const out = [];
  for (const idx of Object.keys(codes)) {
    const name = (descs[idx] || "Cheat").trim().replace(/\s+/g, " ").slice(0, 120);
    // "+"-joined multi-part codes -> newline so each part registers separately.
    const code = codes[idx].trim().toUpperCase().replace(/\+/g, "\n");
    if (code) out.push({ name, code });
  }
  return out;
}

if (!fs.existsSync(srcRoot)) {
  console.error("Source folder not found:", srcRoot);
  process.exit(1);
}

// Rebuild the table in place (don't delete the file — a running dev server may
// hold a read handle open, which blocks deletion on Windows).
const db = new Database(outDb);
db.pragma("journal_mode = WAL");
db.exec("DROP TABLE IF EXISTS cheat_defs;");
db.exec(`
  CREATE TABLE cheat_defs (
    platform   TEXT NOT NULL,
    title_norm TEXT NOT NULL,
    title      TEXT NOT NULL,
    name       TEXT NOT NULL,
    code       TEXT NOT NULL,
    -- One row per cheat name per game (case-insensitive), collapsing the
    -- near-identical duplicates that come from merging a game's region/format
    -- .cht variants (USA/Europe/Game Genie/Action Replay).
    UNIQUE(platform, title_norm, name COLLATE NOCASE)
  );
  CREATE INDEX idx_cheat_defs_lookup ON cheat_defs (platform, title_norm);
`);

const insert = db.prepare(
  "INSERT OR IGNORE INTO cheat_defs (platform, title_norm, title, name, code) VALUES (?, ?, ?, ?, ?)"
);

let files = 0;
let rows = 0;
const systems = fs.readdirSync(srcRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
for (const sysDir of systems) {
  const slug = SYSTEM_MAP[sysDir.name];
  if (!slug) {
    console.log("skip (unmapped):", sysDir.name);
    continue;
  }
  const dir = path.join(srcRoot, sysDir.name);
  const chtFiles = fs.readdirSync(dir).filter((f) => /\.cht$/i.test(f));
  // Import "(Game Genie)" variants first so their letter codes win the dedupe
  // over raw address:value codes (which more often misbehave on the cores).
  chtFiles.sort((a, b) => {
    const ga = /game genie/i.test(a) ? 0 : 1;
    const gb = /game genie/i.test(b) ? 0 : 1;
    return ga - gb || a.localeCompare(b);
  });
  const tx = db.transaction((list) => {
    for (const f of list) {
      let text;
      try {
        text = fs.readFileSync(path.join(dir, f), "utf8");
      } catch {
        continue;
      }
      const tn = normTitle(f.replace(/\.cht$/i, ""));
      if (!tn) continue;
      const title = displayTitle(f);
      for (const c of parseCht(text)) {
        const r = insert.run(slug, tn, title, c.name, c.code);
        rows += r.changes;
      }
      files++;
    }
  });
  tx(chtFiles);
  console.log(`${sysDir.name} -> ${slug}: ${chtFiles.length} files`);
}

const total = db.prepare("SELECT COUNT(*) n FROM cheat_defs").get().n;
const games = db.prepare("SELECT COUNT(DISTINCT platform || title_norm) n FROM cheat_defs").get().n;
console.log(`\nDone. ${files} files parsed -> ${rows} cheats inserted (${total} unique rows, ${games} distinct games).`);
db.close();
