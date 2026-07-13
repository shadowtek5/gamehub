import Link from "next/link";
import GameCover from "./GameCover";
import HoverVideo from "./HoverVideo";
import { platformBySlug } from "@/lib/platforms";
import { formatPlaytime } from "@/lib/format";
import { mediaThumb } from "@/lib/media";
// Pure layout helpers/types live in @/lib/boxLayout so server components can
// import them too (e.g. the system page computes the effective layout).
import {
  type CardRom,
  type CardSizeMode,
  cardSize,
  resolveBoxLayout,
} from "@/lib/boxLayout";

/** Deck-style capsule: pure box art, focus ring does the talking */
export default function GameCard({
  rom,
  size: sizeMode = "natural",
  systemIcon,
  showSystem = false,
}: {
  rom: CardRom;
  /** natural: per-system shape · row: shelf rows (equal height, width varies)
   *  · uniform: mixed-system grids (one footprint, art fills the card) */
  size?: CardSizeMode;
  /** square system-icon URL for the corner badge (mixed-system grids) */
  systemIcon?: string | null;
  /** show the console badge in the lower-right (library / favorites) */
  showSystem?: boolean;
}) {
  const platform = platformBySlug(rom.platform_slug);
  const playtime = formatPlaytime(rom.playtime_seconds);
  const layout = resolveBoxLayout(rom.platform_slug, rom.box_layout);
  const size = cardSize(layout, sizeMode);

  return (
    <Link
      href={`/game/${rom.id}`}
      data-rom-id={rom.id}
      className={`deck-capsule deck-shimmer appportrait_LibraryItemBox_gh relative block shrink-0 overflow-visible ${size.card}`}
      title={playtime ? `${rom.title} — ${playtime}` : rom.title}
    >
      {/* per-art color glow: a blurred, saturated duplicate of this game's own
          cover behind the capsule; fades in on focus (CSS .deck-glow) */}
      {rom.boxart_url && (
        <span
          aria-hidden
          className="deck-glow libraryassetimage_Container_gh pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[112%] w-[110%] -translate-x-1/2 -translate-y-1/2 [filter:saturate(3)_brightness(1.7)_blur(18px)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaThumb(rom.boxart_url, 96) ?? undefined}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </span>
      )}
      <div className={`libraryassetimage_Container_gh w-full overflow-hidden rounded-[3px] bg-raised ${size.cover}`}>
        <GameCover
          title={rom.title}
          boxartUrl={rom.boxart_url}
          color={platform?.color}
          shortName={platform?.shortName}
          className="h-full w-full"
          fit="cover"
          thumbWidth={400}
          eager
        />
        {rom.video_url && <HoverVideo src={rom.video_url} />}
      </div>
      {rom.favorite === 1 && (
        <span className="absolute right-1.5 top-1.5 text-sm text-accent drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          ★
        </span>
      )}
      {/* Console badge — the art fills the card in mixed-system grids, so the
          system pill keeps each game's platform legible (Steam-style). */}
      {showSystem && (systemIcon || platform?.shortName) && (
        <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex h-[22px] items-center gap-1 rounded-full bg-black/70 pl-1 pr-2 shadow-[0_1px_3px_rgba(0,0,0,0.6)] ring-1 ring-white/10 backdrop-blur-sm">
          {systemIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={systemIcon} alt="" className="h-4 w-4 rounded-[2px] object-contain" />
          ) : (
            <span
              className="h-4 w-4 rounded-[2px]"
              style={{ backgroundColor: platform?.color ?? "#3d4450" }}
            />
          )}
          <span className="text-[10px] font-bold uppercase leading-none tracking-wide text-white/90">
            {platform?.shortName ?? rom.platform_slug}
          </span>
        </span>
      )}
    </Link>
  );
}
