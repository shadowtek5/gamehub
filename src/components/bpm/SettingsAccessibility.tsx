"use client";

// Settings → Accessibility. Reduce Motion is a real, working toggle: it sets
// a root attribute that CSS uses to disable card scaling and transitions.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GpRow, GpSubHeader, GpToggle } from "./primitives";

// Persisted in a cookie so the root layout can apply data-reduce-motion on the
// server before first paint (no pre-hydration inline script).
function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function persist(on: boolean) {
  document.cookie = `gh-reduce-motion=${on ? "on" : "off"}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.dataset.reduceMotion = on ? "on" : "off";
}

export default function SettingsAccessibility() {
  const t = useTranslations("accessibility");
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let on = readCookie("gh-reduce-motion") === "on";
    // One-time migration for users whose preference is still in localStorage.
    if (!on && localStorage.getItem("gh-reduce-motion") === "on") {
      on = true;
      persist(true);
    }
    setReduceMotion(on);
  }, []);

  function apply(on: boolean) {
    setReduceMotion(on);
    persist(on);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <GpSubHeader>{t("general")}</GpSubHeader>
        <GpRow label={t("reduceMotion")} description={t("reduceMotionDescription")}>
          <GpToggle on={reduceMotion} onChange={apply} label={t("reduceMotion")} />
        </GpRow>
      </div>
    </div>
  );
}
