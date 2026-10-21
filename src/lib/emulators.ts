// Android emulator catalog for handheld clients (GameHub Downloader) and the
// Firmware settings page: which emulators can play each system, how to start a
// game in them, and where each one wants its BIOS files.
//
// The emulator list is Cocoon FE's public platform definitions
// (github.com/inssekt/CocoonFE/tree/main/platforms, the Daijishou "player"
// format). They're fetched at runtime and cached in data/emulators/, never
// bundled: refreshed at most once a day, and the last good copy keeps working
// offline. BIOS destinations aren't part of that format, so they're ours
// (EMULATOR_BIOS below).

import fs from "fs";
import path from "path";
import { getDataDir } from "./dataDir";

const INDEX_URL = "https://raw.githubusercontent.com/inssekt/CocoonFE/main/platforms/index.json";
const SOURCE_URL = "https://github.com/inssekt/CocoonFE/tree/main/platforms";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** One way to start a game (a Cocoon "player"). */
export interface EmulatorPlayer {
  /** Cocoon's unique id, e.g. "psx.com.github.stenzek.duckstation". */
  id: string;
  name: string;
  /** Android package the launch targets, e.g. "com.retroarch.aarch64". */
  package: string;
  /** "retroarch" entries carry the libretro [core] they load. */
  kind: "retroarch" | "standalone";
  core: string | null;
  /** `am start` arguments with {file.path} / {file.uri} / {tags.…} placeholders (Daijishou format). */
  amStartArguments: string;
  /** Which file names this player accepts (Java regex). */
  acceptedFilenameRegex: string | null;
  description: string | null;
}

/** Where a standalone emulator reads BIOS files from, for one or more systems. */
export interface EmulatorBios {
  id: string;
  name: string;
  /** Package names (exact, or a prefix ending in "*"). */
  packages: string[];
  platforms: string[];
  /** Where the files go, in plain words (English; the UI translates by id). */
  where: string;
}

export interface EmulatorCatalog {
  source: { name: string; url: string; fetchedAt: string | null; stale: boolean };
  /** GameHub platform slug → players. */
  platforms: Record<string, EmulatorPlayer[]>;
}

/** Cocoon platform id → GameHub platform slugs. */
const COCOON_TO_GAMEHUB: Record<string, string[]> = {
  "3do": ["3do"],
  adobeflash: ["flash"],
  amstradcpc: ["acpc", "gx4000"],
  apple2: ["appleii"],
  arcadia: ["arcadia2001"],
  atari2600: ["atari2600"],
  atari5200: ["atari5200"],
  atari7800: ["atari7800"],
  atarijaguar: ["jaguar"],
  atarijaguarcd: ["jaguarcd"],
  atarilynx: ["lynx"],
  atarist: ["atarist"],
  atomiswave: ["atomiswave"],
  bbcmicro: ["bbcmicro"],
  cps1: ["arcade"],
  cps2: ["arcade"],
  cps3: ["arcade"],
  fbneo: ["arcade", "neogeo"],
  mame: ["arcade"],
  colecovision: ["coleco"],
  c64: ["c64"],
  amiga: ["amiga", "cd32", "cdtv"],
  dos: ["dos"],
  dreamcast: ["dreamcast"],
  channelf: ["channelf"],
  fds: ["fds"],
  gameandwatch: ["gandw"],
  gb: ["gb"],
  gba: ["gba"],
  gbc: ["gbc"],
  gc: ["gamecube", "triforce"],
  intellivision: ["intellivision"],
  vc4000: ["vc4000"],
  msx: ["msx", "msx2"],
  odyssey2: ["odyssey2"],
  megaduck: ["megaduck"],
  pcfx: ["pcfx"],
  neogeo: ["neogeo"],
  ngp: ["ngp"],
  ngpc: ["ngp"],
  n3ds: ["3ds"],
  n64: ["n64", "n64dd"],
  nds: ["nds"],
  nes: ["nes", "famicom"],
  satellaview: ["satellaview"],
  switch: ["switch"],
  wii: ["wii"],
  wiiu: ["wiiu"],
  wiiware: ["wiiware"],
  pokemini: ["pokemini"],
  sega32x: ["sega32x"],
  segacd: ["segacd", "megacd"],
  gamegear: ["gg"],
  genesis: ["genesis", "megadrive"],
  mastersystem: ["sms", "mark3"],
  naomi: ["naomi", "naomi2"],
  pico: ["segapico"],
  "sg-1000": ["sg1000"],
  saturn: ["saturn"],
  psvita: ["vita"],
  psx: ["psx"],
  ps2: ["ps2"],
  ps3: ["ps3"],
  psp: ["psp"],
  supergrafx: ["supergrafx"],
  snes: ["snes", "superfamicom", "sufami"],
  tg16: ["pce", "pcengine"],
  "tg-cd": ["pcecd", "pcenginecd"],
  vic20: ["vic20"],
  vectrex: ["vectrex"],
  virtualboy: ["vb"],
  supervision: ["supervision8000"],
  wonderswan: ["wonderswan"],
  wonderswancolor: ["wonderswan"],
  xbox: ["xbox"],
  xbox360: ["xbox360"],
  zxspectrum: ["zxspectrum"],
  cdimono1: ["cdi"],
};

/** Standalone emulators that need BIOS files, and where they look for them.
 *  RetroArch isn't here: its cores read the exact names in BIOS_MANIFEST from
 *  its system folder. */
export const EMULATOR_BIOS: EmulatorBios[] = [
  {
    id: "duckstation",
    name: "DuckStation",
    packages: ["com.github.stenzek.duckstation"],
    platforms: ["psx"],
    where: "The folder chosen in DuckStation › Settings › BIOS (BIOS directory).",
  },
  {
    id: "ps2",
    name: "AetherSX2 / NetherSX2 / ARMSX2",
    packages: ["xyz.aethersx2.*", "com.armsx2*", "come.nanodata.armsx2*"],
    platforms: ["ps2"],
    where: "Any folder you then pick in the emulator's BIOS settings (Settings › System › BIOS).",
  },
  {
    id: "melonds",
    name: "melonDS",
    packages: ["me.magnum.melon*"],
    platforms: ["nds"],
    where: "The folder chosen for BIOS and firmware in melonDS › Settings › System (bios7.bin, bios9.bin, firmware.bin).",
  },
  {
    id: "drastic",
    name: "DraStic",
    packages: ["com.dsemu.drastic"],
    platforms: ["nds"],
    where: "DraStic's system folder (DraStic/system). Optional: DraStic runs without them.",
  },
  {
    id: "flycast",
    name: "Flycast",
    packages: ["com.flycast.emulator", "com.reicast.emulator"],
    platforms: ["dreamcast", "naomi", "naomi2", "atomiswave"],
    where: "Flycast's data folder (inside the home folder set in Flycast › Settings › General).",
  },
  {
    id: "redream",
    name: "Redream",
    packages: ["io.recompiled.redream"],
    platforms: ["dreamcast"],
    where: "Redream's folder (Android/data/io.recompiled.redream/files): dc_boot.bin and dc_flash.bin.",
  },
  {
    id: "citra",
    name: "Azahar / Lime3DS / Citra",
    packages: ["org.azahar_emu.azahar*", "io.github.lime3ds.android", "org.citra.citra_emu*", "io.github.borked3ds.android", "org.gamerytb.lemonade*"],
    platforms: ["3ds"],
    where: "The sysdata folder inside the emulator's user folder.",
  },
  {
    id: "saturn",
    name: "Yaba Sanshiro",
    packages: ["org.devmiyax.yabasanshioro2*", "org.uoyabause.*"],
    platforms: ["saturn"],
    where: "The BIOS folder set in Yaba Sanshiro's settings (yabause/bios).",
  },
  {
    id: "switch",
    name: "Eden / Citron / Sudachi / yuzu",
    packages: ["dev.eden.*", "org.citron.*", "org.sudachi.*", "org.yuzu.*", "dev.suyu.*"],
    platforms: ["switch"],
    where: "Eden's folder (or any folder): prod.keys and title.keys, and the firmware .zip or Firmware folder. Then in the emulator choose Install keys and Install firmware.",
  },
  {
    id: "vita3k",
    name: "Vita3K",
    packages: ["org.vita3k.*", "org.vita3kplus.*"],
    platforms: ["vita"],
    where: "Any folder (e.g. BIOS/VITA). Then in Vita3K choose Install firmware and pick PSVUPDAT.PUP, then PSP2UPDAT.PUP.",
  },
  {
    id: "ps3",
    name: "aPS3e / RPCS3",
    packages: ["aenu.aps3e*", "net.rpcs3*"],
    platforms: ["ps3"],
    where: "Any folder (e.g. BIOS/PS3_BIOS). Then install PS3UPDAT.PUP from the emulator's firmware option.",
  },
  {
    id: "cemu",
    name: "Cemu",
    packages: ["info.cemu.*"],
    platforms: ["wiiu"],
    where: "Cemu's user folder (keys.txt goes next to the settings).",
  },
  {
    id: "dolphin",
    name: "Dolphin",
    packages: ["org.dolphinemu.*", "org.mm.j*", "org.dolphin.*"],
    platforms: ["gamecube"],
    where: "Optional. Dolphin's user folder › GC › USA, EUR or JAP as IPL.bin (for the GameCube boot animation).",
  },
];

function cachePath(): string {
  return path.join(getDataDir(), "emulators", "cocoon-catalog.json");
}

interface CachedCatalog {
  fetchedAt: string;
  platforms: Record<string, EmulatorPlayer[]>;
}

function readCache(): CachedCatalog | null {
  try {
    return JSON.parse(fs.readFileSync(cachePath(), "utf8")) as CachedCatalog;
  } catch {
    return null;
  }
}

interface CocoonPlayer {
  name?: string;
  uniqueId?: string;
  description?: string | null;
  acceptedFilenameRegex?: string | null;
  amStartArguments?: string | null;
}

/** Turns one Cocoon player into ours; null when it can't be launched by package. */
export function toPlayer(p: CocoonPlayer): EmulatorPlayer | null {
  const args = (p.amStartArguments ?? "").trim();
  const pkg = /-n\s+([\w.]+)\//.exec(args)?.[1];
  if (!pkg || !p.uniqueId || !p.name) return null;
  const core = /_?([A-Za-z0-9_+-]+?)_libretro(?:_android)?\.so/.exec(args)?.[1]?.replace(/^.*\//, "") ?? null;
  return {
    id: p.uniqueId,
    name: p.name.trim(),
    package: pkg,
    kind: /RetroActivity/.test(args) ? "retroarch" : "standalone",
    core: /RetroActivity/.test(args) ? core : null,
    amStartArguments: args,
    acceptedFilenameRegex: p.acceptedFilenameRegex ?? null,
    description: p.description ?? null,
  };
}

let refreshing: Promise<CachedCatalog | null> | null = null;

/** Downloads every Cocoon platform file and rebuilds the cache. */
async function refresh(): Promise<CachedCatalog | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const signal = AbortSignal.timeout(20_000);
      const index = (await (await fetch(INDEX_URL, { signal })).json()) as {
        baseUri?: string;
        platformList?: { filename: string; platformUniqueId: string }[];
      };
      const base = index.baseUri ?? INDEX_URL.replace(/index\.json$/, "");
      const out: Record<string, EmulatorPlayer[]> = {};
      const list = index.platformList ?? [];
      // A few at a time — it's ~120 small files.
      for (let i = 0; i < list.length; i += 8) {
        await Promise.all(
          list.slice(i, i + 8).map(async (entry) => {
            const slugs = COCOON_TO_GAMEHUB[entry.platformUniqueId];
            if (!slugs) return;
            try {
              const res = await fetch(base + encodeURIComponent(entry.filename), { signal: AbortSignal.timeout(20_000) });
              if (!res.ok) return;
              const data = (await res.json()) as { playerList?: CocoonPlayer[] };
              const players = (data.playerList ?? []).map(toPlayer).filter((p): p is EmulatorPlayer => !!p);
              for (const slug of slugs) {
                const seen = new Set((out[slug] ??= []).map((p) => p.id));
                for (const p of players) if (!seen.has(p.id)) out[slug].push(p);
              }
            } catch {
              /* skip this platform; the rest still update */
            }
          })
        );
      }
      if (!Object.keys(out).length) return null;
      const cached: CachedCatalog = { fetchedAt: new Date().toISOString(), platforms: out };
      fs.mkdirSync(path.dirname(cachePath()), { recursive: true });
      fs.writeFileSync(cachePath(), JSON.stringify(cached));
      return cached;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** The catalog: the cached copy (refreshed in the background once it's a day old),
 *  or a fresh download the first time. */
export async function getEmulatorCatalog(opts: { force?: boolean } = {}): Promise<EmulatorCatalog> {
  let cached = readCache();
  const age = cached ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;
  if (!cached || opts.force) {
    cached = (await refresh()) ?? cached;
  } else if (age > MAX_AGE_MS) {
    void refresh();
  }
  return {
    source: {
      name: "Cocoon FE",
      url: SOURCE_URL,
      fetchedAt: cached?.fetchedAt ?? null,
      stale: !cached || Date.now() - Date.parse(cached.fetchedAt) > MAX_AGE_MS,
    },
    platforms: cached?.platforms ?? {},
  };
}

/** BIOS destinations for standalone emulators that play [slug]. */
export function emulatorBiosFor(slug: string): EmulatorBios[] {
  return EMULATOR_BIOS.filter((e) => e.platforms.includes(slug));
}

/** Which emulators can open a game's file, from the catalog's accepted file names. */
export interface FileSupport {
  file: string;
  /** RetroArch cores that accept it */
  cores: string[];
  /** standalone emulators that accept it / don't */
  standalone: string[];
  rejectedBy: string[];
}

export async function fileSupportFor(slug: string, filename: string): Promise<FileSupport | null> {
  const players = (await getEmulatorCatalog()).platforms[slug];
  if (!players?.length) return null;
  const accepts = (p: EmulatorPlayer) => {
    if (!p.acceptedFilenameRegex) return true;
    try {
      return new RegExp(p.acceptedFilenameRegex, "i").test(filename);
    } catch {
      return true;
    }
  };
  const cores = new Set<string>();
  const ok = new Set<string>();
  const no = new Set<string>();
  for (const p of players) {
    if (p.kind === "retroarch") {
      if (p.core && accepts(p)) cores.add(p.core);
    } else (accepts(p) ? ok : no).add(p.name);
  }
  for (const n of ok) no.delete(n);
  // RetroArch has cores for this system but none takes this file (e.g. a zipped CD image).
  if (!cores.size && players.some((p) => p.kind === "retroarch")) no.add("RetroArch");
  return { file: filename, cores: [...cores], standalone: [...ok], rejectedBy: [...no] };
}
