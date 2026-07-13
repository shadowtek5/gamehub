"use client";

// Bridges the durable per-user language preference (user_settings.language)
// with the gh-locale cookie that next-intl actually reads. The cookie is set
// device-wide by proxy.ts (from Accept-Language) or by the in-app switcher;
// this makes a signed-in user's saved choice follow them onto a new device.
//
// Runs once on mount: if the account's saved language differs from the active
// cookie, it writes the cookie and refreshes so the server re-renders in that
// language. After that the two agree and no further refresh happens.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isLocale, LOCALE_COOKIE } from "@/i18n/locales";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function LanguageSync() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user-settings", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const saved = data?.settings?.language as string | undefined;
        if (!isLocale(saved)) return;
        if (readCookie(LOCALE_COOKIE) === saved) return;
        document.cookie = `${LOCALE_COOKIE}=${saved}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        router.refresh();
      } catch {
        /* ignore — falls back to the cookie/browser locale */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
