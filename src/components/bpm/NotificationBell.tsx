"use client";

// Header bell: unread badge + a popover feed (updates, announcements, admin
// alerts, "someone played" social). Polls /api/notifications; clicking an item
// marks it read and navigates, and "Mark all read" clears the badge.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import type { Notification, NotificationType } from "@/lib/notifications";

const CELL =
  "header_HeaderItem_gh relative flex h-10 cursor-pointer items-center px-[10px] text-white/90 transition-colors hover:text-white Focusable";
const ICON = "h-[18px] w-[18px]";

const TYPE_ICON: Record<NotificationType, React.ReactNode> = {
  update: <path d="M12 3v10m0 0 4-4m-4 4-4-4M5 20h14" />,
  announcement: <path d="M4 10v4h3l5 4V6L7 10H4Zm12.5 2a4 4 0 0 0-2-3.5v7a4 4 0 0 0 2-3.5Z" />,
  alert: <path d="M12 3 2 20h20L12 3Zm0 6v5m0 3h.01" />,
  social: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 5v1h14v-1c0-3-3-5-7-5Z" />,
  friend: <path d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8v-1c0-3 3-5 7-5s7 2 7 5v1H2Zm17-9h4m-2-2v4" />,
  badge: <path d="M8 3h8l-1.2 8.2a3 3 0 0 1-5.6 0L8 3Zm2 10.4V21l2-1.5L14 21v-7.6M5 4h3M16 4h3" />,
};

const TYPE_TINT: Record<NotificationType, string> = {
  update: "text-[#5ad17a]",
  announcement: "text-accent",
  alert: "text-[#e0685f]",
  social: "text-white/70",
  friend: "text-accent",
  badge: "text-[#e5b53f]",
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationBell() {
  const t = useTranslations("chrome.notificationBell");
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      // Read = dismissed: only unread items appear in the feed. (The API still
      // returns read items so mark-read pruning stays correct server-side.)
      setItems((data.notifications ?? []).filter((n: Notification) => !n.read));
      setUnread(data.unread ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  // Poll on mount + every 60s, and refresh whenever the panel opens.
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  // B / Escape closes the panel like every other overlay.
  useEffect(() => {
    const onB = (e: Event) => {
      if (openRef.current) {
        e.preventDefault();
        playSound("modalClose");
        setOpen(false);
      }
    };
    window.addEventListener("gh-b", onB);
    return () => window.removeEventListener("gh-b", onB);
  }, []);

  function toggle() {
    playSound(open ? "modalClose" : "modalOpen");
    setOpen((o) => !o);
    if (!open) void load();
  }

  async function markAllRead() {
    playSound("confirm");
    setUnread(0);
    setItems([]); // unread-only feed — clearing read empties it
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      /* ignore */
    }
  }

  function onItemClick(n: Notification) {
    setOpen(false);
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      void fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: [n.key] }),
      });
    }
  }

  return (
    <>
      <button className={CELL} aria-label={t("notifications")} onClick={toggle} title={t("notifications")}>
        <svg viewBox="0 0 24 24" fill="currentColor" className={ICON}>
          <path d="M12 2a6 6 0 0 0-6 6v3.2L4.3 15a1 1 0 0 0 .9 1.5h13.6a1 1 0 0 0 .9-1.5L18 11.2V8a6 6 0 0 0-6-6Zm0 20a2.8 2.8 0 0 0 2.7-2H9.3A2.8 2.8 0 0 0 12 22Z" />
        </svg>
        {unread > 0 && (
          <span className="absolute right-[3px] top-[5px] flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="gamepaddialog_GamepadDialogContent_gh absolute right-1 top-[42px] z-[71] flex max-h-[70vh] w-[360px] max-w-[94vw] flex-col overflow-hidden rounded-[4px] bg-[#23262e] shadow-2xl ring-1 ring-white/10"
            data-overlay="open"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-black/40 px-4 py-2.5">
              <span className="text-[15px] font-bold text-bright">{t("notifications")}</span>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="Focusable cursor-pointer text-[12px] font-semibold text-accent hover:brightness-125"
                >
                  {t("markAllRead")}
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px] text-dim">{t("allCaughtUp")}</div>
              ) : (
                items.map((n) => {
                  const inner = (
                    <>
                      <span className={`mt-[2px] shrink-0 ${TYPE_TINT[n.type]}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
                          {TYPE_ICON[n.type]}
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] ${n.read ? "text-dim" : "font-semibold text-body"}`}>
                          {n.title}
                        </span>
                        {n.body && <span className="mt-0.5 block line-clamp-2 text-[12px] text-dim">{n.body}</span>}
                        <span className="mt-0.5 block text-[11px] text-white/35">{timeAgo(n.createdAt)}</span>
                      </span>
                      {!n.read && <span className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />}
                    </>
                  );
                  const cls = "Focusable flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-white/5";
                  return n.external ? (
                    <a
                      key={n.key}
                      href={n.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onItemClick(n)}
                      className={cls}
                    >
                      {inner}
                    </a>
                  ) : (
                    <Link key={n.key} href={n.href ?? "#"} onClick={() => onItemClick(n)} className={cls}>
                      {inner}
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
