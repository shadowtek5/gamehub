"use client";

import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/sounds";

export interface GameTab {
  key: string;
  label: string;
  content: React.ReactNode;
  /** optional trailing marker (e.g. a ✓ badge on GAME INFO when scraped) */
  badge?: React.ReactNode;
}

/** Centered pill tabs (ACTIVITY / YOUR STUFF / GAME INFO), SteamOS style */
export default function GameTabs({ tabs }: { tabs: GameTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  // When the tab row reaches the top it sticks below the header; a sentinel
  // just above it flips `stuck`, which extends the frosted bar up over the
  // header band (so content doesn't bleed through the transparent header).
  const [stuck, setStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), {
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="gamepadtabbedpage_GamepadTabbedPage_gh">
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />
      <div
        className={`gamepadtabbedpage_TabHeaderRowWrapper_gh sticky top-0 z-30 flex items-center justify-center gap-2 transition-[padding,background-color] duration-150 ${
          stuck ? "bg-black/50 pb-4 pt-[52px] backdrop-blur-[100px]" : "py-6"
        }`}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`pill-tab gamepadtabbedpage_Tab_gh ${
              t.key === current?.key ? "gamepadtabbedpage_Selected_gh" : ""
            }`}
            data-active={t.key === current?.key}
            onClick={() => {
              playSound("tab");
              setActive(t.key);
            }}
          >
            <span className="gamepadtabbedpage_TabTitle_gh inline-flex items-center gap-1.5">
              {t.label}
              {t.badge}
            </span>
          </button>
        ))}
      </div>
      {/* pb clears the fixed 42px controller-legend footer (footer_BasicFooter_gh)
          so the last row / caption isn't hidden behind it. */}
      <div className="gamepadtabbedpage_TabContentsScroll_gh mx-auto max-w-[1100px] px-8 pb-20">
        {current?.content}
      </div>
    </div>
  );
}
