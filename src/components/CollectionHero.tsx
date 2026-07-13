import { formatPlaytime } from "@/lib/format";
import RibbonCollage, { HERO_LAYOUT } from "@/components/RibbonCollage";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

// The per-collection header — the same game-details hero + play bar the system
// pages use, applied to a collection. A full-bleed banner (a tilted cover
// mosaic of the collection's games, falling back to a brand gradient) sits above
// a Deck-geometry stat bar (game count, playtime, favorites) with the
// collection's tools on the right. The filtered library grid renders below it.
//
// Carries the same sharedappdetailsheader / appdetailsplaysection hooks as
// SystemHero so deckthemes CSS treats it as an app-details page.

interface CollectionStats {
  total: number;
  playtime_seconds: number;
  favorites: number;
  last_played_at: string | null;
}

// A collection has no single platform colour; use a neutral Steam-blue accent
// for the collage backing/gradient. Virtual pages override with their own tone.
const DEFAULT_ACCENT = "#3d6fb4";

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

export default async function CollectionHero({
  name,
  description,
  smart = false,
  isPublic = false,
  ownerName,
  own = true,
  covers,
  stats,
  chips = [],
  tools,
  accent = DEFAULT_ACCENT,
  badge,
  glyph,
  kindLabel,
  statusText,
}: {
  name: string;
  description?: string | null;
  smart?: boolean;
  isPublic?: boolean;
  ownerName?: string;
  own?: boolean;
  covers: string[];
  stats: CollectionStats;
  /** smart-collection filter chips (shown in the status row) */
  chips?: string[];
  tools?: ReactNode;
  /** collage/gradient tone (default Steam-blue) */
  accent?: string;
  /** extra badge shown next to the title (e.g. "🤖 Virtual · Genre") */
  badge?: ReactNode;
  /** play-bar left glyph (default ⚡ for smart, ▤ otherwise) */
  glyph?: string;
  /** play-bar left label (default "Smart Collection" / "Collection") */
  kindLabel?: string;
  /** status-row text when there are no chips (default per kind) */
  statusText?: string;
}) {
  const t = await getTranslations("collectionsComps.hero");
  const hasCovers = covers.length > 0;
  const playtime = formatPlaytime(stats.playtime_seconds);
  const leftGlyph = glyph ?? (smart ? "⚡" : "▤");
  const leftLabel = kindLabel ?? (smart ? t("smartCollection") : t("collection"));

  return (
    <div className="appdetailsoverview_Container_gh">
      {/* Full-bleed hero — mirrors the game/system page's sharedappdetailsheader. */}
      <div className="sharedappdetailsheader_ImgContainer_gh relative h-[42vh] min-h-[280px] w-full overflow-hidden rounded-t-[6px] [perspective:1800px]">
        {hasCovers ? (
          <>
            {/* blurred full-bleed backdrop so the tilted mosaic's corners never
                expose a flat triangle */}
            <div className="absolute inset-0 bg-[#0b0f14]" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={covers[0]}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl brightness-[0.5]"
            />
            <RibbonCollage covers={covers} color={accent} layout={HERO_LAYOUT} zoom={185} tiltX={50} />
          </>
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(115deg, #14181f 25%, ${accent}55 100%)` }}
            />
            <div className="pointer-events-none absolute -right-4 -top-10 select-none text-[180px] font-black leading-none text-white/[0.06]">
              {name.slice(0, 2).toUpperCase()}
            </div>
          </>
        )}

        {/* scrims: top black fade + bottom fade into the page surface */}
        <div className="absolute inset-x-0 top-0 h-[75px] bg-gradient-to-b from-black/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#24282f]/90 to-transparent" />

        {/* Centered title — the game hero's TitleLogo slot. */}
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 px-8 text-center">
          {hasCovers && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(46% 46% at 50% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 45%, transparent 72%)",
              }}
            />
          )}
          <div className="relative flex flex-col items-center gap-2">
            <h1 className="appdetailsgameinfopanel_Name_gh max-w-3xl text-4xl font-black text-bright [text-shadow:0_2px_10px_rgba(0,0,0,0.9),0_0_28px_rgba(0,0,0,0.6)] md:text-5xl">
              {name}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {badge}
              {smart && (
                <span className="rounded bg-accent/25 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-accent [text-shadow:none]">
                  {t("smartBadge")}
                </span>
              )}
              {isPublic && (
                <span className="rounded bg-white/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white/90 [text-shadow:none]">
                  {t("public")}{!own && ownerName ? t("byOwner", { ownerName }) : ""}
                </span>
              )}
            </div>
            {description && (
              <p className="max-w-2xl text-sm text-white/85 [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
                {description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Play bar — Deck geometry (appdetailsplaysection): a collection glyph on
          the left, stacked stat blocks, tools on the right. */}
      <div className="appdetailsplaysection_PlayBar_gh px-6 pt-4">
        <div className="flex min-h-12 items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex shrink-0 items-center gap-3 pr-2">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-[4px] text-[20px] text-white"
                style={{ background: `linear-gradient(135deg, ${accent}, #23262e)` }}
                aria-hidden
              >
                {leftGlyph}
              </span>
              <span className="text-[16px] font-medium text-white">{leftLabel}</span>
            </div>
            <Stat label={t("games")} value={stats.total.toLocaleString()} />
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

        {/* centered status row — the smart-filter chips (or a plain divider) */}
        <div className="appdetailsplaysection_CloudStatusRow_gh -mx-6 mt-2 flex items-center gap-4 py-1">
          <span className="h-px flex-1 bg-white/15" aria-hidden />
          <div className="flex max-w-[70%] flex-wrap items-center justify-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.5px] text-white/70">
            {smart && chips.length > 0 ? (
              <>
                {chips.map((c) => (
                  <span key={c} className="rounded-full bg-white/10 px-3 py-0.5 normal-case tracking-normal">
                    {c}
                  </span>
                ))}
                <span className="appdetailsplaysection_CloudStatusLabel_gh">{t("updatesAutomaticallySuffix")}</span>
              </>
            ) : (
              <span className="appdetailsplaysection_CloudStatusLabel_gh">
                {statusText ?? (smart ? t("updatesAutomatically") : t("handPicked"))}
              </span>
            )}
          </div>
          <span className="h-px flex-1 bg-white/15" aria-hidden />
        </div>
      </div>
    </div>
  );
}
