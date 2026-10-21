// System firmware and keys for consoles whose emulators install a firmware
// package rather than reading libretro BIOS files: PS Vita and PS3 update PUPs,
// Switch keys and firmware (a .zip or a folder of .nca files), 3DS and Wii U keys.
// These are large, often multi-file, and kept exactly as uploaded — never
// unpacked or renamed — so the emulator's own "Install firmware" can use them.
// Hand-maintained (the libretro BIOS list in biosManifest.ts doesn't cover them).

export interface FirmwarePackage {
  /** Stable id within the system, e.g. "firmware", "prodkeys". */
  id: string;
  /** What it is, in plain words (English; the UI translates by `${slug}.${id}`). */
  label: string;
  required: boolean;
  /** File names that belong to this package (matched on the base name, case-insensitive). */
  match: RegExp;
  /** A folder of files (e.g. Switch firmware .nca files): stored under `folder/` and kept together. */
  folder?: string;
  /** Biggest single file accepted. */
  maxBytes: number;
}

const MB = 1024 * 1024;

export const FIRMWARE_PACKAGES: Record<string, FirmwarePackage[]> = {
  vita: [
    { id: "firmware", label: "System firmware (PSVUPDAT.PUP)", required: true, match: /^psvupdat\.pup$/i, maxBytes: 512 * MB },
    { id: "fonts", label: "Font package (PSP2UPDAT.PUP)", required: true, match: /^psp2updat\.pup$/i, maxBytes: 512 * MB },
  ],
  ps3: [
    { id: "firmware", label: "System firmware (PS3UPDAT.PUP)", required: true, match: /^ps3updat\.pup$/i, maxBytes: 512 * MB },
  ],
  switch: [
    { id: "prodkeys", label: "Product keys (prod.keys)", required: true, match: /^prod\.keys$/i, maxBytes: 1 * MB },
    { id: "titlekeys", label: "Title keys (title.keys)", required: false, match: /^title\.keys$/i, maxBytes: 8 * MB },
    {
      id: "firmware",
      label: "System firmware (a .zip, or a folder of .nca files)",
      required: true,
      // "Firmware 22.0.0.zip", "Firmware.17.0.0.zip", "switch-firmware-19.0.1.zip"… or the .nca files themselves.
      match: /^(?:.*firmware.*\.zip|[0-9a-f]{32}(?:\.cnmt)?\.nca)$/i,
      folder: "Firmware",
      maxBytes: 1024 * MB,
    },
  ],
  "3ds": [
    { id: "aeskeys", label: "AES keys (aes_keys.txt)", required: false, match: /^aes_keys\.txt$/i, maxBytes: 1 * MB },
    { id: "seeddb", label: "Seed database (seeddb.bin)", required: false, match: /^seeddb\.bin$/i, maxBytes: 64 * MB },
  ],
  wiiu: [
    { id: "keys", label: "Disc keys (keys.txt)", required: false, match: /^keys\.txt$/i, maxBytes: 8 * MB },
  ],
};

/** The package [base] belongs to on [slug], if any. */
export function matchPackage(slug: string, base: string): FirmwarePackage | null {
  return FIRMWARE_PACKAGES[slug]?.find((p) => p.match.test(base)) ?? null;
}

/** Every (system, package) a file name could belong to. */
export function matchPackageAnywhere(base: string): { slug: string; pkg: FirmwarePackage }[] {
  const out: { slug: string; pkg: FirmwarePackage }[] = [];
  for (const [slug, list] of Object.entries(FIRMWARE_PACKAGES)) {
    for (const pkg of list) if (pkg.match.test(base)) out.push({ slug, pkg });
  }
  return out;
}

/** Where a package file is stored inside the system's firmware folder. Loose .nca files
 *  go in the package's folder; everything else keeps its own name. */
export function packageFileName(pkg: FirmwarePackage, base: string): string {
  return pkg.folder && /\.nca$/i.test(base) ? `${pkg.folder}/${base}` : base;
}

/** Which package a stored firmware row belongs to. */
export function packageOfRow(slug: string, filename: string): FirmwarePackage | null {
  const list = FIRMWARE_PACKAGES[slug];
  if (!list) return null;
  const base = filename.split("/").pop() ?? filename;
  const top = filename.includes("/") ? filename.split("/")[0] : null;
  return list.find((p) => (top && p.folder === top) || p.match.test(base)) ?? null;
}
