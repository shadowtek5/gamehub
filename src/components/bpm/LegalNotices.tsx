"use client";

// Third-Party Legal Notices — Steam-style attribution for every library,
// emulator, data service, dataset and asset GameHub builds on. Grouped by kind;
// each entry lists its licence and a link. Data-provider content and trademarks
// remain the property of their owners — GameHub queries their services and does
// not redistribute their databases.

import { GpModal, GpButton } from "./primitives";

interface Notice {
  name: string;
  by?: string;
  license: string;
  url: string;
}

interface Group {
  heading: string;
  blurb?: string;
  items: Notice[];
}

const GROUPS: Group[] = [
  {
    heading: "Application framework & libraries",
    items: [
      { name: "Next.js", by: "Vercel", license: "MIT", url: "https://nextjs.org" },
      { name: "React & React DOM", by: "Meta", license: "MIT", url: "https://react.dev" },
      { name: "Tailwind CSS", by: "Tailwind Labs", license: "MIT", url: "https://tailwindcss.com" },
      { name: "@react-spring/web", by: "Poimandres", license: "MIT", url: "https://www.react-spring.dev" },
      { name: "@tanstack/react-virtual", by: "Tanner Linsley", license: "MIT", url: "https://tanstack.com/virtual" },
      { name: "better-sqlite3", by: "Joshua Wise", license: "MIT", url: "https://github.com/WiseLibs/better-sqlite3" },
      { name: "SQLite", license: "Public Domain", url: "https://sqlite.org" },
      { name: "sharp", by: "Lovell Fuller", license: "Apache-2.0", url: "https://sharp.pixelplumbing.com" },
      { name: "libvips (sharp engine)", license: "LGPL-2.1", url: "https://www.libvips.org" },
      { name: "bcryptjs", license: "MIT", url: "https://github.com/dcodeIO/bcrypt.js" },
      { name: "basic-ftp", license: "MIT", url: "https://github.com/patrickjuchli/basic-ftp" },
      { name: "yauzl", by: "Josh Wolfe", license: "MIT", url: "https://github.com/thejoshwolfe/yauzl" },
      { name: "clsx", by: "Luke Edwards", license: "MIT", url: "https://github.com/lukeed/clsx" },
      { name: "fastest-levenshtein", license: "MIT", url: "https://github.com/ka-weihe/fastest-levenshtein" },
    ],
  },
  {
    heading: "Emulation",
    blurb: "Games run in the browser via EmulatorJS and libretro cores. Each core carries its own licence.",
    items: [
      { name: "EmulatorJS", license: "GPL-3.0 (+ core licences)", url: "https://emulatorjs.org" },
      { name: "libretro / RetroArch cores", license: "Various (GPL, etc.)", url: "https://www.libretro.com" },
    ],
  },
  {
    heading: "Game metadata & artwork providers",
    blurb: "Accessed through each service's API with your own credentials. All data, artwork and trademarks belong to the respective service — GameHub does not redistribute their databases.",
    items: [
      { name: "ScreenScraper.fr", license: "Data © ScreenScraper", url: "https://www.screenscraper.fr" },
      { name: "IGDB", by: "Twitch / Amazon", license: "Data © IGDB", url: "https://www.igdb.com" },
      { name: "MobyGames", license: "Data © MobyGames", url: "https://www.mobygames.com" },
      { name: "SteamGridDB", license: "Data © contributors", url: "https://www.steamgriddb.com" },
      { name: "EmuMovies", license: "Data © EmuMovies", url: "https://emumovies.com" },
      { name: "LaunchBox Games Database", by: "Unbroken Software", license: "Data © LaunchBox", url: "https://gamesdb.launchbox-app.com" },
      { name: "libretro-thumbnails", license: "Community-contributed", url: "https://github.com/libretro-thumbnails" },
      { name: "Flashpoint Archive", license: "Data © Flashpoint", url: "https://flashpointarchive.org" },
      { name: "RetroAchievements", license: "Data © RetroAchievements", url: "https://retroachievements.org" },
      { name: "Hasheous", license: "Hash lookup service", url: "https://hasheous.org" },
      { name: "HowLongToBeat", license: "Data © HowLongToBeat", url: "https://howlongtobeat.com" },
    ],
  },
  {
    heading: "Reference datasets",
    blurb: "Used to identify and verify files by hash/name. GameHub embeds only their metadata (hashes and canonical names), never the files themselves.",
    items: [
      { name: "No-Intro", license: "DAT metadata", url: "https://no-intro.org" },
      { name: "Redump", license: "DAT metadata", url: "http://redump.org" },
      { name: "MAME", license: "DAT metadata", url: "https://www.mamedev.org" },
      { name: "The RetroBIOS Project", by: "Abdess", license: "BIOS manifest metadata", url: "https://github.com/Abdess/retrobios" },
    ],
  },
  {
    heading: "Assets",
    items: [
      { name: "Gamepad Asset Pack", by: "AL2009man", license: "MIT", url: "https://github.com/AL2009man/Gamepad-Asset-Pack" },
      { name: "GameHub UI sounds", license: "Original (CC0)", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
    ],
  },
];

export default function LegalNotices({ onClose }: { onClose: () => void }) {
  return (
    <GpModal
      title="Third-Party Legal Notices"
      width={720}
      onClose={onClose}
      footer={
        <GpButton primary onClick={onClose}>
          Close
        </GpButton>
      }
    >
      <div className="max-h-[62vh] overflow-y-auto pr-1">
        <p className="mb-5 text-[13px] leading-relaxed text-dim">
          GameHub is built on the open-source software, emulation projects, data
          services and datasets below. All product names, logos, trademarks and
          content are the property of their respective owners; their use here is
          for identification and attribution only.
        </p>

        <div className="flex flex-col gap-6">
          {GROUPS.map((group) => (
            <div key={group.heading}>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-dim">
                {group.heading}
              </div>
              {group.blurb && (
                <p className="mb-2 text-[12px] leading-relaxed text-dim/80">{group.blurb}</p>
              )}
              <div className="flex flex-col divide-y divide-white/[0.06] rounded-[4px] bg-white/[0.03]">
                {group.items.map((n) => (
                  <a
                    key={n.name}
                    href={n.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-4 px-3.5 py-2.5 hover:bg-white/[0.05]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] text-body">{n.name}</span>
                      {n.by && <span className="block text-[11px] text-dim">{n.by}</span>}
                    </span>
                    <span className="shrink-0 rounded-[3px] bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-dim">
                      {n.license}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </GpModal>
  );
}
