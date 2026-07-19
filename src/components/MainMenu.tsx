"use client";

// SteamOS main menu: solid left panel between the top and bottom bars,
// icon + label rows, active row marked with a blue edge bar, Power last.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { setChromeOverlay, useExclusiveOverlay } from "@/lib/chromeOverlay";

const ICON = "h-5 w-5";

const ICONS: Record<string, React.ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON}>
      <path d="M12 3 2 12h3v8a1 1 0 0 0 1 1h5v-6h2v6h5a1 1 0 0 0 1-1v-8h3L12 3Z" />
    </svg>
  ),
  library: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON}>
      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />
    </svg>
  ),
  systems: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON}>
      <path d="M6 9a4 4 0 0 0-4 4v3a3 3 0 0 0 5.8 1.1L8.6 15h6.8l.8 2.1A3 3 0 0 0 22 16v-3a4 4 0 0 0-4-4H6Zm1 2.5h1.5V13H10v1.5H8.5V16H7v-1.5H5.5V13H7v-1.5Zm9.5.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm2 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
    </svg>
  ),
  collections: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON}>
      <path d="M5 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm8.5 1.2 3.8-1a2 2 0 0 1 2.4 1.4l3 11.6a2 2 0 0 1-1.4 2.4l-3.9 1a2 2 0 0 1-2.4-1.4l-3-11.6a2 2 0 0 1 1.5-2.4Z" />
    </svg>
  ),
  media: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON}>
      <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3.5 10.5 3-4 2.5 3 2-2.5 3.5 4.5h-11Z" />
    </svg>
  ),
  downloads: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v11m0 0-4-4m4 4 4-4M5 20h14" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2 6 4-14 2 8h6" />
    </svg>
  ),
  review: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 3l1.9 5.1L20 10l-5.1 1.9L13 17l-1.9-5.1L6 10l5.1-1.9L13 3zM5 15v3M3.5 16.5h3" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON}>
      <path d="m10.3 3 .4 2.2a7 7 0 0 0-1.9 1.1L6.7 5.5 5 8.5l1.8 1.4a7 7 0 0 0 0 2.2L5 13.5l1.7 3 2.1-.8a7 7 0 0 0 1.9 1.1L10.3 19h3.4l.4-2.2a7 7 0 0 0 1.9-1.1l2.1.8 1.7-3-1.8-1.4a7 7 0 0 0 0-2.2L19.8 8.5l-1.7-3-2.1.8a7 7 0 0 0-1.9-1.1L13.7 3h-3.4ZM12 8.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4Z" />
    </svg>
  ),
  power: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON}>
      <path d="M11 3h2v9h-2V3Zm-3.4 3.1 1.2 1.6a6 6 0 1 0 6.4 0l1.2-1.6a8 8 0 1 1-8.8 0Z" />
    </svg>
  ),
};

export default function MainMenu({
  isAdmin,
}: {
  username: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  const activeItem = useRef<HTMLAnchorElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");
  // Reuse the review page's own (already-translated) title for the menu label.
  const tr = useTranslations("libraryReview");

  const items = [
    { href: "/", label: t("home"), icon: "home" },
    { href: "/library", label: t("library"), icon: "library" },
    { href: "/systems", label: t("systems"), icon: "systems" },
    { href: "/collections", label: t("collections"), icon: "collections" },
    ...(isAdmin
      ? [
          { href: "/downloads", label: t("downloads"), icon: "downloads" },
          { href: "/library/review", label: tr("title"), icon: "review" },
          { href: "/activity", label: t("activity"), icon: "activity" },
          { href: "/settings", label: t("settings"), icon: "settings" },
        ]
      : []),
  ];
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  // the row to land focus on when the menu opens = the current page (Steam
  // highlights where you are, not always Home). Fall back to the first item.
  const activeIndex = Math.max(0, items.findIndex((it) => isActive(it.href)));

  useEffect(() => {
    // The menu button toggles: pressing it again while the menu is open closes
    // it (matches the Quick Access panel and the physical Deck menu button).
    const onOpen = () =>
      setOpen((o) => {
        playSound(o ? "menuClose" : "menuOpen");
        return !o;
      });
    const onB = (e: Event) => {
      if (openRef.current) {
        e.preventDefault();
        playSound("menuClose");
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen((o) => {
          playSound(o ? "menuClose" : "menuOpen");
          return !o;
        });
      }
    };
    window.addEventListener("gh-mainmenu", onOpen);
    window.addEventListener("gh-b", onB);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("gh-mainmenu", onOpen);
      window.removeEventListener("gh-b", onB);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open) activeItem.current?.focus();
  }, [open]);

  // Tell the header/footer to go near-opaque while the menu is open.
  useEffect(() => {
    setChromeOverlay("mainmenu", open);
    return () => setChromeOverlay("mainmenu", false);
  }, [open]);

  // Close when Quick Access opens or the profile avatar is tapped.
  useExclusiveOverlay("mainmenu", () => setOpen(false));

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    router.push("/login");
    router.refresh();
  }

  if (!open) return null;

  return (
    // gh-tab-mainmenu scopes the theme's MainMenu.css here (CSS Loader injects
    // it into the main-menu window only)
    <div className="gh-tab-mainmenu fixed inset-x-0 bottom-[42px] top-10 z-[95]" data-overlay="open">
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      {/* 240px panel on #0e141b, items vertically centered — geometry from
          the live BPM capture: 48px rows, 20px icons, 18px/400 labels with
          16px gap, blue rounded indicator stripe on the active row */}
      <div className="overlay-left mainmenu_Menu_gh absolute inset-y-0 left-0 flex w-[240px] flex-col bg-[#0e141b] shadow-2xl">
        <nav className="flex flex-1 flex-col justify-center overflow-y-auto py-10">
          {items.map((item, i) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                ref={i === activeIndex ? activeItem : undefined}
                onClick={() => setOpen(false)}
                className="menu-item mainmenu_Item_gh relative !h-12 !gap-4 !py-0 !pl-6 !pr-4 text-[18px] !font-normal"
                data-active={active}
              >
                {active && (
                  // active-page indicator: the ActiveDot the Pip-Boy theme
                  // reshapes into an 8px square. Color via var(--accent) so it
                  // follows the theme instead of a hardcoded blue.
                  <span
                    className="mainmenu_ActiveDot_gh absolute left-[7px] top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full"
                    // marginLeft:0 neutralizes the theme's margin-left:12px (no
                    // !important) so the dot sits in the left gutter, clear of
                    // the icon, the same in both themed and default renders.
                    style={{ background: "var(--accent)", marginLeft: 0 }}
                    aria-hidden
                  />
                )}
                <span className="mainmenu_ItemIcon_gh h-5 w-5 opacity-90">{ICONS[item.icon]}</span>
                <span className="mainmenu_ItemLabel_gh">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={signOut}
            className="menu-item mainmenu_Item_gh relative !h-12 !gap-4 !py-0 !pl-6 !pr-4 text-[18px] !font-normal"
          >
            <span className="mainmenu_ItemIcon_gh h-5 w-5 opacity-90">{ICONS.power}</span>
            <span className="mainmenu_ItemLabel_gh">{t("power")}</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
