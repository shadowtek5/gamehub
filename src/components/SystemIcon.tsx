import { Platform, platformVendor } from "@/lib/platforms";

// Console-silhouette icons: each system maps to a hardware archetype
// (cartridge console, disc console, handheld, clamshell, computer, arcade
// cabinet, …) drawn as an SVG glyph tinted with the system's color.

type Arch =
  | "console"
  | "hump"
  | "cube"
  | "disc"
  | "tower"
  | "slim"
  | "hybrid"
  | "handheldV"
  | "handheldH"
  | "clamshell"
  | "computer"
  | "arcade"
  | "crt";

const ARCHETYPES: Record<string, Arch> = {
  // cartridge home consoles
  nes: "console", famicom: "console", snes: "console", superfamicom: "console",
  sms: "console", mark3: "console", genesis: "console", megadrive: "console",
  sg1000: "console", atari2600: "console", atari5200: "console", atari7800: "console",
  supergrafx: "console", pcengine: "console", pce: "console", coleco: "console",
  intellivision: "console", channelf: "console", odyssey2: "console",
  arcadia2001: "console", astrocade: "console", vc4000: "console",
  supervision8000: "console", pv1000: "console", pv2000: "console", scv: "console", fds: "console",
  satellaview: "console", sufami: "console", sega32x: "console", segapico: "console",
  jaguar: "console", gx4000: "console",
  // N64-style humped consoles
  n64: "hump", n64dd: "hump",
  // cubes / micro consoles
  gamecube: "cube", ouya: "cube",
  // disc-lid consoles
  psx: "disc", saturn: "disc", dreamcast: "disc", segacd: "disc", megacd: "disc",
  pcecd: "disc", pcenginecd: "disc", cdi: "disc", "3do": "disc", cdtv: "disc",
  cd32: "disc", jaguarcd: "disc", xbox: "disc",
  // towers
  ps2: "tower", pcfx: "tower", xbox360: "tower",
  // slim vertical consoles
  wii: "slim", wiiware: "slim", ps3: "slim", wiiu: "slim",
  // hybrid
  switch: "hybrid",
  // vertical handhelds (Game Boy family)
  gb: "handheldV", gbc: "handheldV", pokemini: "handheldV", megaduck: "handheldV",
  gamepocket: "handheldV", ngp: "handheldV",
  // horizontal handhelds
  gba: "handheldH", lynx: "handheldH", psp: "handheldH", vita: "handheldH",
  gg: "handheldH", wonderswan: "handheldH", vb: "handheldH",
  // clamshells / dual screen
  nds: "clamshell", "3ds": "clamshell", gandw: "clamshell",
  // home computers
  c64: "computer", amiga: "computer", msx: "computer", msx2: "computer",
  dos: "computer", appleii: "computer", acpc: "computer", zxspectrum: "computer",
  bbcmicro: "computer", electron: "computer", archimedes: "computer",
  atarist: "computer", atari800: "computer", vic20: "computer",
  maxmachine: "computer", exidysorcerer: "computer", mikrosha: "computer",
  vg5000: "computer", camplynx: "computer", flash: "computer", chailove: "computer",
  // arcade boards / cabinets
  arcade: "arcade", neogeo: "arcade", daphne: "arcade", laserdisc: "arcade",
  naomi: "arcade", naomi2: "arcade", atomiswave: "arcade", model2: "arcade",
  model3: "arcade", hikaru: "arcade", triforce: "arcade",
  // CRT / tabletop
  vectrex: "crt", adventurevision: "crt",
};

const DARK = "rgba(0,0,0,0.45)";
const LITE = "rgba(255,255,255,0.55)";

function Glyph({ type, color }: { type: Arch; color: string }) {
  switch (type) {
    case "console":
      return (
        <g>
          <rect x="2" y="9" width="20" height="8.5" rx="1.3" fill={color} />
          <rect x="4.5" y="11" width="8.5" height="2" rx="0.5" fill={DARK} />
          <rect x="4.5" y="14.5" width="5" height="1" rx="0.5" fill={LITE} />
          <circle cx="17" cy="13.5" r="1.2" fill={DARK} />
          <circle cx="20" cy="13.5" r="1.2" fill={DARK} />
        </g>
      );
    case "hump":
      return (
        <g>
          <rect x="2.5" y="12" width="19" height="6.5" rx="1.3" fill={color} />
          <rect x="7.5" y="8" width="9" height="6" rx="1.5" fill={color} />
          <rect x="9.5" y="9.8" width="5" height="1.8" rx="0.5" fill={DARK} />
          <circle cx="5.5" cy="15.2" r="1.1" fill={DARK} />
          <circle cx="18.5" cy="15.2" r="1.1" fill={DARK} />
        </g>
      );
    case "cube":
      return (
        <g>
          <rect x="9" y="4.5" width="6" height="3" rx="1" fill={color} />
          <rect x="4.5" y="6.5" width="15" height="13" rx="2" fill={color} />
          <rect x="8" y="10" width="8" height="6.5" rx="1" fill={DARK} />
          <circle cx="12" cy="13.2" r="1.6" fill={LITE} />
        </g>
      );
    case "disc":
      return (
        <g>
          <rect x="2.5" y="9.5" width="19" height="8" rx="1.3" fill={color} />
          <circle cx="10" cy="13.5" r="3.1" fill={DARK} />
          <circle cx="10" cy="13.5" r="1.1" fill={LITE} />
          <circle cx="17.5" cy="13.5" r="1" fill={DARK} />
          <circle cx="20" cy="13.5" r="1" fill={DARK} />
        </g>
      );
    case "tower":
      return (
        <g>
          <rect x="7.5" y="3.5" width="9" height="17.5" rx="1.3" fill={color} />
          <rect x="9" y="6" width="6" height="1.2" rx="0.4" fill={DARK} />
          <rect x="9" y="8.5" width="6" height="1.2" rx="0.4" fill={DARK} />
          <circle cx="12" cy="17" r="1.2" fill={LITE} />
        </g>
      );
    case "slim":
      return (
        <g>
          <rect x="8.5" y="3.5" width="7" height="17.5" rx="2.2" fill={color} />
          <rect x="10" y="6" width="4" height="0.9" rx="0.4" fill={DARK} />
          <circle cx="12" cy="17.5" r="1" fill={LITE} />
        </g>
      );
    case "hybrid":
      return (
        <g>
          <rect x="4" y="7" width="3.2" height="10.5" rx="1.4" fill={color} />
          <rect x="16.8" y="7" width="3.2" height="10.5" rx="1.4" fill={color} />
          <rect x="7.5" y="7.5" width="9" height="9.5" rx="0.6" fill={color} />
          <rect x="8.4" y="8.6" width="7.2" height="7.3" fill={DARK} />
          <circle cx="5.6" cy="10" r="0.9" fill={DARK} />
          <circle cx="18.4" cy="14" r="0.9" fill={DARK} />
        </g>
      );
    case "handheldV":
      return (
        <g>
          <rect x="7" y="2.8" width="10" height="18.4" rx="1.6" fill={color} />
          <rect x="8.7" y="4.5" width="6.6" height="6" rx="0.5" fill={DARK} />
          <path d="M9.2 14.2h1.4v-1.4h1.4v1.4h1.4v1.4h-1.4V17h-1.4v-1.4H9.2z" fill={DARK} />
          <circle cx="14.6" cy="16.4" r="0.95" fill={DARK} />
          <circle cx="16" cy="14.6" r="0.95" fill={DARK} />
        </g>
      );
    case "handheldH":
      return (
        <g>
          <rect x="2.2" y="7.5" width="19.6" height="9.5" rx="3.4" fill={color} />
          <rect x="8.4" y="9.2" width="7.2" height="6.1" rx="0.5" fill={DARK} />
          <path d="M4.4 11.4h1.2v-1.2h1.2v1.2H8v1.2H6.8v1.2H5.6v-1.2H4.4z" fill={DARK} />
          <circle cx="18.2" cy="11" r="0.95" fill={DARK} />
          <circle cx="19.8" cy="13" r="0.95" fill={DARK} />
        </g>
      );
    case "clamshell":
      return (
        <g>
          <rect x="6.5" y="3" width="11" height="8.6" rx="1" fill={color} />
          <rect x="8.2" y="4.5" width="7.6" height="5.4" rx="0.4" fill={DARK} />
          <rect x="6" y="12.2" width="12" height="8.8" rx="1" fill={color} />
          <rect x="9.3" y="13.4" width="5.4" height="4" rx="0.4" fill={DARK} />
          <circle cx="7.9" cy="18.9" r="0.9" fill={DARK} />
          <circle cx="16.1" cy="18.9" r="0.9" fill={DARK} />
        </g>
      );
    case "computer":
      return (
        <g>
          <rect x="5.5" y="3.5" width="13" height="9.5" rx="1" fill={color} />
          <rect x="7" y="5" width="10" height="6.5" rx="0.4" fill={DARK} />
          <path d="M4 15.5 L20 15.5 L21.5 20 L2.5 20 Z" fill={color} />
          <rect x="5.5" y="16.8" width="13" height="1.1" rx="0.4" fill={DARK} />
        </g>
      );
    case "arcade":
      return (
        <g>
          <path
            d="M6 2.8h12v4.4l-1.8 2v4.4l1.8 2.2v5.4H6v-5.4l1.8-2.2V9.2L6 7.2z"
            fill={color}
          />
          <rect x="8.6" y="7.6" width="6.8" height="4.6" rx="0.4" fill={DARK} />
          <rect x="7" y="3.8" width="10" height="1.6" rx="0.4" fill={DARK} />
          <circle cx="10" cy="15" r="0.9" fill={DARK} />
          <circle cx="14" cy="15" r="0.9" fill={DARK} />
        </g>
      );
    case "crt":
      return (
        <g>
          <rect x="6.5" y="2.8" width="11" height="14.5" rx="1.2" fill={color} />
          <rect x="8.3" y="4.6" width="7.4" height="8" rx="0.5" fill={DARK} />
          <rect x="8.3" y="14" width="7.4" height="1.4" rx="0.5" fill={DARK} />
          <rect x="9.5" y="17.3" width="5" height="3.5" rx="0.7" fill={color} />
        </g>
      );
  }
}

const SIZES = {
  sm: "h-8 w-8 rounded-[6px]",
  md: "h-12 w-12 rounded-[8px]",
  lg: "h-16 w-16 rounded-[10px]",
  xl: "h-40 w-40 rounded-[20px]",
} as const;

export default function SystemIcon({
  platform,
  size = "md",
  iconUrl,
}: {
  platform: Platform;
  size?: keyof typeof SIZES;
  /** Scraped/chosen system icon — when present it overrides the drawn glyph */
  iconUrl?: string | null;
}) {
  const arch = ARCHETYPES[platform.slug] ?? "console";
  // A bundled default icon is a white monochrome console glyph (shipped in
  // public/system-defaults/icon) — it gets the same diagonal brand-wash tile as
  // the drawn silhouette so the two read as one system, whereas a scraped icon
  // (usually a full-bleed console photo) keeps the neutral tile + cover crop.
  const isBundled = !!iconUrl && iconUrl.startsWith("/system-defaults/icon/");
  const glyphish = !iconUrl || isBundled; // wants the brand-wash tile
  const washTile = glyphish
    ? {
        background: `linear-gradient(135deg, color-mix(in srgb, ${platform.color} 62%, #e6ecf4) 0%, color-mix(in srgb, ${platform.color} 52%, #0c1017) 55%, #0a0e13 100%)`,
      }
    : undefined;
  return (
    <span
      className={`flex shrink-0 select-none items-center justify-center overflow-hidden ring-1 ring-white/10 ${
        iconUrl && !isBundled ? "bg-[#141a21]" : ""
      } ${SIZES[size]}`}
      style={washTile}
      title={`${platformVendor(platform.slug)} — ${platform.name}`}
      aria-hidden
    >
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt=""
          className={
            isBundled
              ? "h-[70%] w-[70%] object-contain [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.35))]"
              : "h-full w-full object-cover"
          }
        />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-[70%] w-[70%]"
          style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.35))" }}
        >
          <Glyph type={arch} color="#f3f7fc" />
        </svg>
      )}
    </span>
  );
}
