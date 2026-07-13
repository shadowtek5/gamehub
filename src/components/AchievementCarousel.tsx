"use client";

// SteamOS achievement carousel (game details → Your Stuff): a horizontal row
// where the FOCUSED (or hovered) achievement expands into the wide featured
// card — icon + name + description + points — and every other one collapses to
// an icon-only badge, exactly like the Deck. Locked badges are desaturated.

import { useState } from "react";
import { useTranslations } from "next-intl";

export interface CarouselAch {
  badgeUrl: string;
  title: string;
  description: string;
  points: number;
  earned: boolean;
}

export default function AchievementCarousel({
  achievements,
  raUrl,
}: {
  achievements: CarouselAch[];
  raUrl: string | null;
}) {
  // the expanded item — defaults to the first, then follows focus/hover
  const [active, setActive] = useState(0);
  const t = useTranslations("achievements.carousel");

  return (
    <div className="no-scrollbar flex items-center gap-2 overflow-x-auto p-1">
      {achievements.map((a, i) => {
        const expanded = i === active;
        return (
          <a
            key={i}
            href={raUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            tabIndex={0}
            onFocus={(e) => {
              setActive(i);
              e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
            }}
            onMouseEnter={() => setActive(i)}
            title={`${a.title} — ${a.description}${a.earned ? "" : t("lockedSuffix")} · ${t("pts", { points: a.points })}`}
            className={`appdetailsachievementssection_AchievementCarouselItem_gh Focusable ${
              a.earned
                ? "appdetailsachievementssection_Achieved_gh"
                : "appdetailsachievementssection_NotAchieved_gh"
            } flex h-[90px] shrink-0 cursor-pointer items-center gap-3 rounded-[4px] outline-none transition-[width,background-color,padding] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] focus:ring-2 focus:ring-inset focus:ring-white ${
              expanded ? "w-[360px] max-w-[85vw] bg-[#3d4450] p-2" : "w-[82px] justify-center"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.badgeUrl}
              alt={a.title}
              loading="lazy"
              className={`shrink-0 rounded-[4px] transition-[height,width] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${expanded ? "h-[74px] w-[74px]" : "h-[82px] w-[82px]"} ${a.earned ? "" : "opacity-40 grayscale"}`}
            />
            {expanded && (
              <div className="min-w-0 flex-1">
                <div className="appdetailsachievementssection_Name_gh truncate text-[16px] font-medium text-white">
                  {a.title}
                </div>
                <div className="appdetailsachievementssection_Description_gh mt-0.5 line-clamp-2 text-[13px] font-light text-white/50">
                  {a.description}
                </div>
                <div className="appdetailsachievementssection_Achieved_gh mt-1 text-[12px] text-[#b8bcbf]">
                  {t("pointsLabel", { points: a.points })}{a.earned ? t("unlockedSuffix") : ""}
                </div>
              </div>
            )}
          </a>
        );
      })}
    </div>
  );
}
