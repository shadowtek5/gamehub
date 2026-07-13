"use client";

// Steam store "category" tile (store.steampowered.com/category): a tilted
// collage of the group's capsules filling a 16:9 card, washed with a per-tile
// color tint, the name in a centered white pill. Shared by the Collections
// page and the library's Collections view so they read identically.

import Link from "next/link";
import { useTranslations } from "next-intl";

/** Deterministic hue (0-359) from a string, so each tile gets a stable tint. */
function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export default function CategoryTile({
  href,
  onClick,
  name,
  count,
  covers,
  badges,
  subtitle,
}: {
  /** Navigate here on click (Collections page). Ignored when onClick is set. */
  href?: string;
  /** Handle the click in place (library Collections view) — renders a button. */
  onClick?: () => void;
  name: string;
  count: number;
  covers: string[];
  badges?: React.ReactNode;
  subtitle?: string;
}) {
  const t = useTranslations("shelves.categoryTile");
  const hue = hueFromString(name);
  const base = `hsl(${hue} 55% 40%)`;
  const base2 = `hsl(${(hue + 28) % 360} 55% 30%)`;
  const wash = `hsl(${hue} 50% 48% / 0.42)`;
  const wash2 = `hsl(${(hue + 28) % 360} 50% 40% / 0.42)`;
  const tiles =
    covers.length > 0 ? Array.from({ length: 12 }, (_, i) => covers[i % covers.length]) : [];

  const className =
    "allcollections_Collection_gh deck-card group relative block aspect-[16/9] w-full overflow-hidden rounded-[6px] text-left";
  const style = { background: `linear-gradient(135deg, ${base}, ${base2})` };

  const inner = (
    <>
      {tiles.length > 0 && (
        <div className="allcollections_CollectionBG_gh absolute inset-[-28%] grid rotate-[-18deg] grid-cols-4 gap-1.5">
          {tiles.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt=""
              aria-hidden
              loading="lazy"
              className="allcollections_CapsuleImage_gh h-full w-full object-cover"
            />
          ))}
        </div>
      )}
      {/* light colored wash so the capsule art shows through */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(135deg, ${wash}, ${wash2})` }}
      />
      <div className="absolute inset-0 bg-black/10 transition-colors duration-300 group-hover:bg-black/0" />
      {badges && (
        <div className="absolute inset-x-0 top-0 flex flex-wrap gap-1.5 p-2.5">{badges}</div>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-4 text-center">
        <span className="allcollections_CollectionLabel_gh max-w-full rounded-[4px] bg-white px-4 py-2 text-[14px] font-bold uppercase leading-tight tracking-wide text-[#1b2838] shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
          {name}
        </span>
        <span className="allcollections_CollectionLabelCount_gh text-[11px] font-semibold text-white/85 drop-shadow">
          {t("gameCount", { count })}
          {subtitle ? ` · ${subtitle}` : ""}
        </span>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className={`${className} cursor-pointer`} style={style} title={name}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={href ?? "#"} className={className} style={style} title={name}>
      {inner}
    </Link>
  );
}
