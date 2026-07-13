import { getTranslations } from "next-intl/server";
import { Platform, platformPlayable } from "@/lib/platforms";
import { formatPlaytime } from "@/lib/format";
import SystemIcon from "@/components/SystemIcon";
import RibbonCollage, { HERO_LAYOUT } from "@/components/RibbonCollage";
import type { SystemArt } from "@/lib/systemArt";
import type { SystemMeta } from "@/lib/systemMeta";
import type { ReactNode } from "react";

// ScreenScraper reports type/media in French — surface friendly English.
const MEDIA_FORMATS: Record<string, string> = {
  cartouche: "Cartridge", cd: "CD", dvd: "DVD", "cd/dvd": "Disc",
  disquette: "Floppy disk", disque: "Disc", cassette: "Cassette",
  carte: "Card", "carte memoire": "Memory card", digital: "Digital",
  bluray: "Blu-ray", umd: "UMD",
};
function niceType(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.replace(/console portable/i, "Handheld").replace(/console/i, "Console");
}
function niceFormat(f: string | null | undefined): string | null {
  if (!f) return null;
  return MEDIA_FORMATS[f.toLowerCase()] ?? f;
}
function yearRange(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return null;
  return b && b !== a ? `${a}–${b}` : a;
}

/**
 * The per-system header — the game-details hero + play bar, applied to a whole
 * console. A full-bleed banner (blurred fill + sharp wide art + the system
 * wheel logo, falling back to the top-rated cover collage, then the brand
 * gradient) sits above a Deck-geometry stat bar (game count, playtime, last
 * played, favorites) with the system tools on the right. The library grid
 * renders below it, exactly like a game's tabs sit under its play bar.
 *
 * Carries Steam's sharedappdetailsheader / appdetailsplaysection hooks so
 * deckthemes CSS treats it as an app-details page.
 */

interface SystemStats {
  total: number;
  scraped: number;
  favorites: number;
  playtime_seconds: number;
  last_played_at: string | null;
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="appdetailsplaysection_PlayBarLabel_gh text-[12px] font-bold uppercase tracking-[0.5px] text-white/70">
        {label}
      </div>
      <div className="appdetailsplaysection_PlayBarDetailLabel_gh text-[16px] font-medium text-white">
        {value}
      </div>
    </div>
  );
}

export default async function SystemHero({
  platform,
  art,
  meta,
  covers,
  heroCollage = null,
  stats,
  tools,
}: {
  platform: Platform;
  art: SystemArt;
  meta?: SystemMeta | null;
  covers: string[];
  /** pre-rendered hero collage image; when present it replaces the live 3D
   *  RibbonCollage (fewer requests). Falls back to live when null. */
  heroCollage?: string | null;
  stats: SystemStats;
  tools?: ReactNode;
}) {
  const released = meta ? yearRange(meta.yearStart, meta.yearEnd) : null;
  const kind = meta ? niceType(meta.systemType) : null;
  const format = meta ? niceFormat(meta.mediaFormat) : null;
  // The hero is either the generated cover collage or a chosen/scraped image,
  // per the system's hero_source. When "ribbon" is chosen (the default) we show
  // the collage if there are covers; otherwise the scraped wallpaper, then the
  // screenmarquee (branded landscape) as a backup, then the brand gradient.
  const hasCovers = covers.length > 0;
  const wantRibbon = art.heroSource !== "image";
  const heroImg = art.hero ?? art.ribbon;
  const showRibbon = hasCovers && (wantRibbon || !heroImg);
  const imgSrc = showRibbon ? null : heroImg;
  // The screenmarquee already carries the system's branding, so we skip our own
  // logo overlay only when it's what's showing (art.hero is the plainer wallpaper).
  const brandedFallback = !!imgSrc && !art.hero;
  // Real art behind the logo (collage or wallpaper) needs a readability scrim;
  // the plain brand gradient is already dark enough.
  const overArt = showRibbon || !!imgSrc;
  // A dark logo needs the opposite treatment: a light backdrop + white glow so
  // it reads, instead of the dark scrim + dark halo that lifts a light logo.
  const darkLogo = !!art.logo && art.logoDark;
  const scrimBg = darkLogo
    ? "radial-gradient(46% 46% at 50% 50%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.22) 45%, transparent 72%)"
    : "radial-gradient(46% 46% at 50% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 45%, transparent 72%)";
  const logoFilter = darkLogo
    ? "drop-shadow(0 0 2px rgba(255,255,255,0.95)) drop-shadow(0 0 12px rgba(255,255,255,0.7)) drop-shadow(0 1px 1px rgba(0,0,0,0.35))"
    : "drop-shadow(0 0 1px rgba(255,255,255,0.5)) drop-shadow(0 1px 1px rgba(0,0,0,0.92)) drop-shadow(0 3px 12px rgba(0,0,0,0.8)) drop-shadow(0 0 30px rgba(0,0,0,0.5))";
  const playable = platformPlayable(platform);
  const playtime = formatPlaytime(stats.playtime_seconds);
  const t = await getTranslations("systemsView.hero");

  return (
    <div className="appdetailsoverview_Container_gh">
      {/* Full-bleed hero — mirrors the game page's sharedappdetailsheader. */}
      <div className="sharedappdetailsheader_ImgContainer_gh relative h-[42vh] min-h-[280px] w-full overflow-hidden rounded-t-[6px] [perspective:1800px]">
        {showRibbon ? (
          <>
            {/* blurred full-bleed backdrop of the art (Steam-style) so the tilted
                mosaic's corners never expose a flat triangle — any gap reveals
                soft, darkened cover art instead */}
            <div className="absolute inset-0 bg-[#0b0f14]" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={covers[0]}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl brightness-[0.5]"
            />
            {heroCollage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroCollage}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <RibbonCollage
                covers={covers}
                color={platform.color}
                layout={HERO_LAYOUT}
                zoom={185}
                tiltX={50}
              />
            )}
          </>
        ) : imgSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc}
              alt=""
              aria-hidden
              className="sharedappdetailsheader_ImgSrc_gh absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.7]"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc}
              alt=""
              aria-hidden
              className="sharedappdetailsheader_ImgSrc_gh absolute inset-0 h-full w-full object-cover"
            />
          </>
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(115deg, #14181f 25%, ${platform.color}55 100%)`,
              }}
            />
            <div className="pointer-events-none absolute -right-4 -top-10 select-none text-[180px] font-black leading-none text-white/[0.06]">
              {platform.shortName}
            </div>
          </>
        )}

        {/* scrims: top black fade + bottom fade into the page surface */}
        <div className="absolute inset-x-0 top-0 h-[75px] bg-gradient-to-b from-black/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#24282f]/90 to-transparent" />

        {/* Centered logo + label — the game hero's TitleLogo. The screenmarquee
            fallback already carries the system's branding, so we only overlay
            our own logo/name over the plainer collage / wallpaper / gradient
            fallbacks (the play bar below always shows the stats). */}
        {!brandedFallback && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 px-8 text-center">
            {/* soft radial scrim behind the title so a light logo/name reads over
                busy cover art or a bright wallpaper (skipped over the plain
                gradient, which is already dark) */}
            {overArt && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: scrimBg }}
              />
            )}
            {art.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={art.logo}
                alt={platform.name}
                // Backdrop + shadow adapt to the logo's brightness: a light logo
                // gets a dark scrim + dark halo; a dark logo gets a light scrim +
                // white glow. Either way it separates from the art behind it.
                style={{ filter: logoFilter }}
                className="sharedappdetailsheader_TitleLogo_gh relative max-h-[55%] max-w-[46%] object-contain"
              />
            ) : (
              <h1 className="appdetailsgameinfopanel_Name_gh relative max-w-3xl text-4xl font-black text-bright [text-shadow:0_2px_10px_rgba(0,0,0,0.9),0_0_28px_rgba(0,0,0,0.6)] md:text-5xl">
                {platform.name}
              </h1>
            )}
          </div>
        )}

      </div>

      {/* Play bar — Deck geometry (appdetailsplaysection): brand chip on the
          left in the game page's play-button slot, stacked stat blocks, and
          system tools on the right. */}
      <div className="appdetailsplaysection_PlayBar_gh px-6 pt-4">
        <div className="flex min-h-12 items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex shrink-0 items-center gap-3 pr-2">
              <SystemIcon platform={platform} size="md" iconUrl={art.icon} />
              <span className="text-[16px] font-medium text-white">{platform.shortName}</span>
            </div>
            <Stat label={t("games")} value={stats.total.toLocaleString()} />
            {meta?.manufacturer && <Stat label={t("maker")} value={meta.manufacturer} />}
            {released && <Stat label={t("released")} value={released} />}
            {kind && <Stat label={t("type")} value={kind} />}
            {format && <Stat label={t("media")} value={format} />}
            <Stat label={t("playTime")} value={playtime || "—"} />
            <Stat
              label={t("lastPlayed")}
              value={stats.last_played_at ? stats.last_played_at.slice(0, 10) : t("never")}
            />
            {stats.favorites > 0 && (
              <Stat label={t("favorites")} value={stats.favorites.toLocaleString()} />
            )}
          </div>
          {tools && <div className="flex shrink-0 items-center gap-[10px]">{tools}</div>}
        </div>

        {/* centered status line — GameHub's analog of the Deck's Steam Cloud row */}
        <div className="appdetailsplaysection_CloudStatusRow_gh -mx-6 mt-2 flex items-center gap-4 py-1">
          <span className="h-px flex-1 bg-white/15" aria-hidden />
          <div className="flex items-center gap-2 whitespace-nowrap text-[12px] font-bold uppercase tracking-[0.5px] text-white/70">
            {playable ? (
              <>
                <span className="text-[#59bf40]">✔</span>
                <span className="appdetailsplaysection_CloudStatusLabel_gh">
                  {t("playableInBrowser")}
                </span>
              </>
            ) : (
              <span className="appdetailsplaysection_CloudStatusLabel_gh">
                {t("downloadToPlay", { name: platform.name })}
              </span>
            )}
          </div>
          <span className="h-px flex-1 bg-white/15" aria-hidden />
        </div>
      </div>
    </div>
  );
}
