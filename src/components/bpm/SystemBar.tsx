"use client";

// BPM system bar — fresh build from the live capture:
// 40px transparent overlay bar; flexible search zone left (40px lead-in,
// 18px magnifier at its right end); right-aligned 40px cells with 10px side
// padding: notification bell, quick access, 16px/500 clock, 32px avatar
// with a 3px status stripe on its right edge.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import JobIndicator from "@/components/bpm/JobIndicator";
import NotificationBell from "@/components/bpm/NotificationBell";
import MessagesButton from "@/components/MessagesButton";
import ProfileNavLink from "@/components/ProfileNavLink";
import { useChromeOverlayOpen, useInGameMenuOpen } from "@/lib/chromeOverlay";

function Clock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => {
      let h24 = false;
      try {
        h24 = localStorage.getItem("gh-clock24") === "on";
      } catch {}
      setTime(
        new Date().toLocaleTimeString([], {
          hour: h24 ? "2-digit" : "numeric",
          minute: "2-digit",
          hour12: !h24,
        })
      );
    };
    tick();
    const id = setInterval(tick, 10_000);
    window.addEventListener("storage", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("storage", tick);
    };
  }, []);
  // no own color — inherits from the HeaderItem+Clock wrapper so themes
  // recoloring that compound land here too
  return <span className="tabular-nums text-[16px] font-medium">{time}</span>;
}

const ICON = "h-[18px] w-[18px]";
const CELL =
  "header_HeaderItem_gh flex h-10 cursor-pointer items-center px-[10px] text-white/90 transition-colors hover:text-white Focusable";

// The header search field. Keyed by pathname in the parent so it remounts —
// and clears — when you move between the library and different system pages,
// matching the fresh (empty-query) grid that mounts underneath.
function LibrarySearch() {
  const [q, setQ] = useState("");
  const t = useTranslations("nav");
  return (
    <div className="searchbar_SearchBox_gh flex h-10 w-full items-center gap-2">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={`${ICON} shrink-0 text-white/60`}>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <line x1="15.5" y1="15.5" x2="21" y2="21" />
      </svg>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          window.dispatchEvent(new CustomEvent("gh-library-query", { detail: e.target.value }));
        }}
        placeholder={t("searchPlaceholder")}
        className="h-10 w-full min-w-0 bg-transparent text-[16px] text-white outline-none placeholder:text-white/40"
        aria-label={t("searchLibrary")}
        // Reachable by D-pad even though it lives in the chrome header (opt back
        // into gamepad navigation — the rest of the bar stays non-navigable).
        data-nav-allow
      />
    </div>
  );
}

export default function SystemBar({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl?: string | null;
}) {
  // Steam's home applies header_OverrideHeaderBackground: the 40px bar is fully
  // transparent (no fill, no blur) so the hero shows straight through. Same on
  // the game-details page — its hero must bleed to the very top under a
  // transparent header, exactly like the Deck. Other pages keep the near-opaque
  // bar for legibility over their content.
  const pathname = usePathname();
  const t = useTranslations("nav");
  const isHome = pathname === "/";
  const heroPage = isHome || pathname.startsWith("/game/");
  // While the Main Menu / Quick Access panel is open, go near-opaque (even on
  // hero pages, where the bar is normally transparent) so the panel reads over a
  // clean header instead of the hero art.
  const dimmed = useChromeOverlayOpen();
  // Over the fullscreen emulator (z-100), the in-game Quick Menu asks us to lift
  // above it and paint solid black — GameHub's real header for the game menu.
  const inGame = useInGameMenuOpen();
  const headerBg = inGame
    ? "#000"
    : dimmed
      ? "color-mix(in oklab, var(--color-black) 96%, transparent)"
      : heroPage
        ? undefined
        : "color-mix(in oklab, var(--color-black) 94%, transparent)";
  // On the library AND on a system's detail page, the header IS the search
  // field (Steam). It drives the grid by a gh-library-query event so the two
  // components stay decoupled.
  const isLibrary = pathname === "/library" || pathname.startsWith("/systems/");
  return (
    <header
      data-nav="chrome"
      className={`fixed inset-x-0 top-0 flex h-10 items-center justify-end transition-[background-color] duration-200 ${
        inGame ? "z-[110]" : "z-[60]"
      }`}
      style={headerBg ? { backgroundColor: headerBg } : undefined}
    >
      <div className="flex h-10 min-w-0 flex-1 items-center overflow-hidden pl-10 pr-1">
        {isLibrary ? (
          <LibrarySearch key={pathname} />
        ) : (
          <>
            <div className="flex-1" />
            <button
              onClick={() => window.dispatchEvent(new Event("gh-search"))}
              className={CELL}
              aria-label={t("search")}
              title={t("search")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={ICON}>
                <circle cx="10.5" cy="10.5" r="6.5" />
                <line x1="15.5" y1="15.5" x2="21" y2="21" />
              </svg>
            </button>
          </>
        )}
      </div>

      <JobIndicator />

      <MessagesButton href="/messages" label={t("messages")} className={CELL} />
      <NotificationBell />
      <button
        onClick={() => window.dispatchEvent(new Event("gh-quickaccess"))}
        className={CELL}
        aria-label={t("quickAccess")}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className={ICON}>
          <circle cx="5" cy="12" r="2.2" />
          <circle cx="12" cy="12" r="2.2" />
          <circle cx="19" cy="12" r="2.2" />
        </svg>
      </button>
      {/* Steam puts HeaderItem AND Clock on the same element — themes color
          the compound selector */}
      <div className="header_HeaderItem_gh header_Clock_gh flex h-10 items-center px-[10px] text-white">
        <Clock />
      </div>
      <div className="header_HeaderItem_gh flex h-10 items-center px-[10px]">
        <ProfileNavLink
          href="/account"
          className="steamavatar_avatarHolder_gh Focusable relative block h-8 w-8 cursor-pointer"
          title={username}
          ariaLabel={t("account")}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover shadow-[2px_2px_8px_1px_rgba(0,0,0,0.3)]"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-[#3d4450] text-sm font-black text-white">
              {username.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="absolute -right-[3px] top-0 h-full w-[3px] bg-[#4cb4ff]" aria-hidden />
        </ProfileNavLink>
      </div>
    </header>
  );
}
