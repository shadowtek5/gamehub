"use client";

// Header entry to friend messages, with a live unread badge (polls the inbox).
import Link from "next/link";
import { useEffect, useState } from "react";

export default function MessagesButton({
  href,
  label,
  className,
  iconClass = "h-[18px] w-[18px]",
}: {
  href: string;
  label: string;
  className?: string;
  iconClass?: string;
}) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/messages", { cache: "no-store" });
        const d = await r.json();
        if (alive) setUnread(d.unread ?? 0);
      } catch {}
    };
    void load();
    const id = setInterval(load, 15000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return (
    <Link href={href} aria-label={label} title={label} className={className}>
      <span className="relative inline-flex">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
          <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex min-w-[15px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-[15px] text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </span>
    </Link>
  );
}
