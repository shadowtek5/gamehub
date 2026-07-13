import Link from "next/link";
import GameCover from "@/components/GameCover";
import { platformBySlug } from "@/lib/platforms";

// A touch-sized portrait cover for the /mobile grids and shelves. Fixed-width
// so it tiles predictably; taps go to the mobile game detail.
export default function MobileGameCard({
  id,
  title,
  boxartUrl,
  platformSlug,
  className = "",
}: {
  id: number;
  title: string;
  boxartUrl: string | null;
  platformSlug: string;
  className?: string;
}) {
  const platform = platformBySlug(platformSlug);
  return (
    <Link href={`/mobile/game/${id}`} className={`block ${className}`}>
      <div className="aspect-[3/4] w-full overflow-hidden rounded-[6px] bg-[#1a1f27] ring-1 ring-white/5">
        <GameCover
          title={title}
          boxartUrl={boxartUrl}
          color={platform?.color}
          shortName={platform?.shortName}
          className="h-full w-full"
          fit="cover"
          thumbWidth={300}
        />
      </div>
      <div className="mt-1.5 truncate text-[12px] font-medium text-body">{title}</div>
    </Link>
  );
}
