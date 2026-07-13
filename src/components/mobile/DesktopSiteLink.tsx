"use client";

// "Desktop site" escape hatch. Sets a long-lived cookie so the proxy stops
// auto-redirecting this device to /mobile, then navigates to the main app.

import { useTranslations } from "next-intl";

export default function DesktopSiteLink({ className }: { className?: string }) {
  const t = useTranslations("mobileNav.desktopSiteLink");
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        // 1 year; read by src/proxy.ts to skip the mobile redirect
        document.cookie = "gh-view=desktop; path=/; max-age=31536000; samesite=lax";
        window.location.href = "/";
      }}
    >
      {t("desktopSite")}
    </button>
  );
}
