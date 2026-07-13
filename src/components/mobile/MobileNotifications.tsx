"use client";

// Mobile notification bell for the top bar: unread badge + a bottom sheet feed.
// Same /api/notifications source as the desktop bell; reuses MobileSheet.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { MobileSheet } from "./primitives";
import type { Notification, NotificationType } from "@/lib/notifications";

const TYPE_TINT: Record<NotificationType, string> = {
  update: "text-[#5ad17a]",
  announcement: "text-accent",
  alert: "text-[#e0685f]",
  social: "text-dim",
  friend: "text-accent",
  badge: "text-[#e5b53f]",
};
const TYPE_GLYPH: Record<NotificationType, string> = {
  update: "⬇",
  announcement: "📣",
  alert: "⚠",
  social: "🎮",
  friend: "👋",
  badge: "🏅",
};

// Notifications carry desktop paths; rewrite them to the mobile app's routes.
function toMobileHref(href: string): string {
  if (href === "/account/friends") return "/mobile/profile/friends";
  if (href === "/account") return "/mobile/profile";
  if (href === "/whats-new") return "/mobile/whats-new";
  if (href === "/activity") return "/mobile/activity";
  if (href.startsWith("/game/")) return `/mobile${href}`;
  if (href.startsWith("/profile/")) return `/mobile${href}`;
  return href;
}

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

export default function MobileNotifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const t = useTranslations("mobileMisc");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      // Read = dismissed: only unread items appear. (The API still returns read
      // items so mark-read pruning stays correct server-side.)
      setItems((data.notifications ?? []).filter((n: Notification) => !n.read));
      setUnread(data.unread ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  function show() {
    playSound("modalOpen");
    setOpen(true);
    void load();
  }

  async function markAllRead() {
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
      void fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: [n.key] }),
      });
    }
    if (!n.href) return;
    if (n.external) window.open(n.href, "_blank", "noopener,noreferrer");
    else router.push(toMobileHref(n.href));
  }

  return (
    <>
      <button
        onClick={show}
        aria-label={t("notifications.title")}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-dim active:bg-white/10"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M12 2a6 6 0 0 0-6 6v3.2L4.3 15a1 1 0 0 0 .9 1.5h13.6a1 1 0 0 0 .9-1.5L18 11.2V8a6 6 0 0 0-6-6Zm0 20a2.8 2.8 0 0 0 2.7-2H9.3A2.8 2.8 0 0 0 12 22Z" />
        </svg>
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <MobileSheet onClose={() => setOpen(false)} zIndex={80}>
          <div className="flex items-center justify-between px-5 pb-2">
            <span className="text-[16px] font-bold text-bright">{t("notifications.title")}</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-[13px] font-semibold text-accent">
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="px-5 py-8 text-center text-[14px] text-dim">{t("notifications.allCaughtUp")}</div>
          ) : (
            <div className="flex flex-col">
              {items.map((n) => (
                <button
                  key={n.key}
                  onClick={() => onItemClick(n)}
                  className="flex w-full items-start gap-3 px-5 py-3 text-left active:bg-white/5"
                >
                  <span className={`mt-[1px] shrink-0 text-[16px] ${TYPE_TINT[n.type]}`} aria-hidden>
                    {TYPE_GLYPH[n.type]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[15px] ${n.read ? "text-dim" : "font-semibold text-body"}`}>
                      {n.title}
                    </span>
                    {n.body && <span className="mt-0.5 block text-[13px] text-dim">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-white/35">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />}
                </button>
              ))}
            </div>
          )}
        </MobileSheet>
      )}
    </>
  );
}
