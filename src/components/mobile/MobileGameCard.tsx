import Link from "next/link";
import GameCover from "@/components/GameCover";
import { platformBySlug } from "@/lib/platforms";
import { DEFAULT_COVER_ASPECT } from "@/lib/boxLayout";

/** Width of the mobile grid cover thumbnail — the aspect sampler requests the
 *  same width so it reuses the derivative the cards already fetch. */
export const MOBILE_COVER_THUMB_W = 300;

// A touch-sized cover for the /mobile grids and shelves. The cover well's aspect
// is sampled from the list's first game-with-art (single-system grids) so covers
// fill without cropping; mixed shelves fall back to a portrait default.
export default function MobileGameCard({
  id,
  title,
  boxartUrl,
  platformSlug,
  coverAspect = DEFAULT_COVER_ASPECT,
  className = "",
}: {
  id: number;
  title: string;
  boxartUrl: string | null;
  platformSlug: string;
  /** cover aspect (width / height) for the well — sampled per list */
  coverAspect?: number;
  className?: string;
}) {
  const platform = platformBySlug(platformSlug);
  return (
    <Link href={`/mobile/game/${id}`} className={`block ${className}`}>
      <div
        style={{ aspectRatio: String(coverAspect) }}
        className="w-full overflow-hidden rounded-[6px] bg-[#1a1f27] ring-1 ring-white/5"
      >
        <GameCover
          title={title}
          boxartUrl={boxartUrl}
          color={platform?.color}
          shortName={platform?.shortName}
          className="h-full w-full"
          fit="cover"
          thumbWidth={MOBILE_COVER_THUMB_W}
        />
      </div>
      <div className="mt-1.5 truncate text-[12px] font-medium text-body">{title}</div>
    </Link>
  );
}
