// Small overlays for game cards (desktop/TV grids and the mobile app):
//  - CompatCornerIcon: compatibility at a glance in the top-left corner, Steam Deck style
//    (green check = Playable, amber ! = Runs with issues, red ✕ = Broken). Unknown → nothing.
//  - VariantRibbon: a diagonal ribbon across the top-right corner for fan translations,
//    ROM hacks, homebrew, prototypes, betas and demos.
// Also CompatGlyph, the same icon for the game page's Compatibility stat.

import { useTranslations } from "next-intl";

export const COMPAT_COLORS: Record<string, string> = { playable: "#59bf40", runs: "#d9a441", broken: "#e0625f" };
/** text colors with enough contrast on the dark page */
export const COMPAT_TEXT: Record<string, string> = { playable: "#6fd352", runs: "#f0c46a", broken: "#f08a87" };

const GLYPHS: Record<string, string> = {
  playable: "M6.5 11.3l3 3 6-6.4",
  runs: "M11 6.3v5.6M11 15.4v.2",
  broken: "M7.6 7.6l6.8 6.8M14.4 7.6l-6.8 6.8",
};

export function CompatGlyph({ level, size = 18, label }: { level: string; size?: number; label?: string }) {
  const color = COMPAT_COLORS[level];
  if (!color) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle cx="11" cy="11" r="10.5" fill={color} stroke="#0b0d11" strokeWidth="1" />
      <path d={GLYPHS[level]} stroke="#0b0d11" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CompatCornerIcon({ level, className = "left-1.5 top-1.5" }: { level?: string | null; className?: string }) {
  const t = useTranslations("cardBadges");
  if (!level || !COMPAT_COLORS[level]) return null;
  return (
    <span className={`pointer-events-none absolute z-[1] flex drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${className}`} title={t(`compat.${level}`)}>
      <CompatGlyph level={level} size={20} label={t(`compat.${level}`)} />
    </span>
  );
}

/** Variants that get a ribbon (formats like digital / cia / dlc / updates don't). */
const RIBBON_COLORS: Record<string, string> = {
  translations: "#66b3ff",
  hacks: "#c08cff",
  homebrew: "#4fd1c5",
  prototypes: "#b8bfc7",
  betas: "#b8bfc7",
  demos: "#b8bfc7",
};

export function hasRibbon(variant?: string | null): boolean {
  return !!variant && variant in RIBBON_COLORS;
}

export function VariantRibbon({ variant, small = false }: { variant?: string | null; small?: boolean }) {
  const t = useTranslations("cardBadges");
  if (!variant || !RIBBON_COLORS[variant]) return null;
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute right-0 top-0 z-[1] overflow-hidden rounded-tr-[3px] ${small ? "h-[64px] w-[64px]" : "h-[84px] w-[84px]"}`}
    >
      <span
        className={`absolute block rotate-45 text-center font-extrabold uppercase text-[#0b0d11] shadow-[0_1px_3px_rgba(0,0,0,0.6)] ${
          small
            ? "right-[-30px] top-[11px] w-[110px] py-[1px] text-[8px] tracking-[0.5px]"
            : "right-[-34px] top-[18px] w-[140px] py-[2px] text-[9px] tracking-[0.6px]"
        }`}
        style={{ backgroundColor: RIBBON_COLORS[variant] }}
      >
        {t(`ribbon.${variant}`)}
      </span>
    </span>
  );
}

/** The ribbon's text for screen readers (the ribbon itself is decorative). */
export function useVariantLabel(variant?: string | null): string | null {
  const t = useTranslations("cardBadges");
  return variant && RIBBON_COLORS[variant] ? t(`ribbon.${variant}`) : null;
}

/** The game page's Compatibility stat (desktop/TV play bar, mobile quick-stats strip). */
export function CompatStat({
  level,
  source,
  emulator,
  device,
  mobile = false,
}: {
  level: string;
  source: "device" | "list" | "browser";
  emulator: string | null;
  device: string | null;
  mobile?: boolean;
}) {
  const t = useTranslations("cardBadges");
  if (!COMPAT_COLORS[level]) return null;
  const from =
    source === "device"
      ? device
        ? t("fromDevice", { emulator: emulator ?? "", device })
        : (emulator ?? "")
      : source === "list"
        ? t("fromList", { emulator: emulator ?? "" })
        : t("fromBrowser");
  const label = t(`compat.${level}`);
  if (mobile) {
    return (
      <div className="shrink-0 rounded-[8px] bg-[#1a1f27] px-3 py-2 ring-1 ring-white/5" title={from}>
        <div className="text-[10px] font-bold uppercase tracking-wide text-dim">{t("statLabel")}</div>
        <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: COMPAT_TEXT[level] }}>
          <CompatGlyph level={level} size={13} />
          {label}
        </div>
      </div>
    );
  }
  return (
    <div title={from}>
      <div className="appdetailsplaysection_PlayBarLabel_gh text-[12px] font-bold uppercase tracking-[0.5px] text-white/70">
        {t("statLabel")}
      </div>
      <div className="appdetailsplaysection_PlayBarDetailLabel_gh flex items-center gap-2 text-[16px] font-medium" style={{ color: COMPAT_TEXT[level] }}>
        <CompatGlyph level={level} size={16} />
        {label}
      </div>
    </div>
  );
}
