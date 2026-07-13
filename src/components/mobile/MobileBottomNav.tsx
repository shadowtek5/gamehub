"use client";

// Conventional mobile bottom tab bar — the primary nav for the /mobile app.
// Dark Steam-style skin, but standard mobile ergonomics (fixed bottom, 5 tabs,
// safe-area aware, accent on the active tab).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const ICON = "h-[22px] w-[22px]";
const TABS = [
  {
    href: "/mobile",
    label: "home",
    match: (p: string) => p === "/mobile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={ICON}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12 12 3.5 21.5 12M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
      </svg>
    ),
  },
  {
    href: "/mobile/library",
    label: "library",
    match: (p: string) => p.startsWith("/mobile/library") || p.startsWith("/mobile/game"),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={ICON}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/mobile/systems",
    label: "systems",
    match: (p: string) => p.startsWith("/mobile/systems"),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={ICON}>
        <rect x="2.5" y="6" width="19" height="12" rx="3" /><path strokeLinecap="round" d="M7 10v4M5 12h4" />
        <circle cx="16.5" cy="11" r="1" fill="currentColor" stroke="none" /><circle cx="18.5" cy="14" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: "/mobile/collections",
    label: "collections",
    match: (p: string) => p.startsWith("/mobile/collections"),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={ICON}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5z" />
      </svg>
    ),
  },
  {
    href: "/mobile/settings",
    label: "settings",
    match: (p: string) => p.startsWith("/mobile/settings"),
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={ICON}>
        <path fillRule="evenodd" clipRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.5 7.5 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.6 7.6 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.6 7.6 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.5 7.5 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" />
      </svg>
    ),
  },
];

// Admin-only tab, inserted before Settings when the viewer can run jobs.
const DOWNLOADS_TAB = {
  href: "/mobile/downloads",
  label: "downloads",
  match: (p: string) => p.startsWith("/mobile/downloads"),
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={ICON}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v11m0 0-4-4m4 4 4-4M5 20h14" />
    </svg>
  ),
};

export default function MobileBottomNav({ showDownloads = false }: { showDownloads?: boolean }) {
  const t = useTranslations("mobileNav.bottomNav");
  const pathname = usePathname() || "/mobile";
  // Downloads sits just before Settings for admins/editors (who can run jobs).
  const tabs = showDownloads ? [...TABS.slice(0, -1), DOWNLOADS_TAB, TABS[TABS.length - 1]] : TABS;

  // Badge count on the Downloads tab: active job + its remaining "up next"
  // systems + jobs queued behind it. Only polled for admins who see the tab.
  const [dlCount, setDlCount] = useState(0);
  useEffect(() => {
    if (!showDownloads) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch("/api/jobs");
        if (res.ok && !stop) {
          const data = await res.json();
          const running = (data.jobs ?? []).filter((j: { running: boolean }) => j.running);
          const active = running[0] as
            | { currentSystem: string; systemQueue: { slug: string; total: number; done: number }[] }
            | undefined;
          const upNext = active
            ? active.systemQueue.filter((s) => s.slug !== active.currentSystem && s.done < s.total).length
            : 0;
          setDlCount(running.length + upNext + (data.queued ?? []).length);
        }
      } catch {
        /* ignore */
      }
      if (!stop) timer = setTimeout(poll, 2500);
    }
    poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [showDownloads]);

  return (
    <nav
      aria-label={t("primary")}
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-white/10 bg-[#12161c]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        const badge = tab.href === "/mobile/downloads" && dlCount > 0 ? dlCount : 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2 active:bg-white/5"
          >
            <span className={`relative ${active ? "text-accent" : "text-dim"}`}>
              {tab.icon}
              {badge > 0 && (
                <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-black ring-2 ring-[#12161c]">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </span>
            <span className={`text-[10px] font-semibold leading-none ${active ? "text-bright" : "text-dim"}`}>
              {t(tab.label)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
