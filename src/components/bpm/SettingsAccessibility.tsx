"use client";

// Settings → Accessibility. Reduce Motion is a real, working toggle: it sets
// a root attribute that CSS uses to disable card scaling and transitions.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GpRow, GpSubHeader, GpToggle } from "./primitives";

export default function SettingsAccessibility() {
  const t = useTranslations("accessibility");
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const on = localStorage.getItem("gh-reduce-motion") === "on";
    setReduceMotion(on);
  }, []);

  function apply(on: boolean) {
    setReduceMotion(on);
    localStorage.setItem("gh-reduce-motion", on ? "on" : "off");
    document.documentElement.dataset.reduceMotion = on ? "on" : "off";
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
