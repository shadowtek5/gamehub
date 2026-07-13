// Steam-style badge tile. Renders the badge's generated artwork (What's New
// style, see lib/badgeArt.ts); falls back to a colored plate with the emoji for
// any badge without an art variant. Server-safe (no client hooks).

import type { ProfileBadge } from "@/lib/profile";
import { badgeArtUrl } from "@/lib/badgeArt";

const SIZES = {
  sm: "h-9 w-9 text-base",
  md: "h-14 w-14 text-2xl",
  lg: "h-16 w-16 text-3xl",
  xl: "h-24 w-24 text-4xl",
} as const;

export default function BadgeIcon({
  badge,
  size = "md",
}: {
  badge: ProfileBadge;
  size?: keyof typeof SIZES;
}) {
  const title = `${badge.name} — ${badge.detail} (${badge.xp} XP)`;
  if (badge.art) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={badgeArtUrl(badge.art, { color: badge.color })}
        alt={badge.name}
        title={title}
        className={`shrink-0 rounded-[6px] object-cover ring-1 ring-white/15 ${SIZES[size]}`}
      />
    );
  }
  const isNumber = /^\d+$/.test(badge.icon);
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[4px] font-black text-white/90 shadow-inner ring-1 ring-white/15 ${SIZES[size]}`}
      style={{ background: `linear-gradient(160deg, ${badge.color}, #10131a)` }}
      title={title}
    >
      {isNumber ? badge.icon : <span>{badge.icon}</span>}
    </span>
  );
}
