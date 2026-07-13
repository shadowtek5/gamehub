"use client";

// Settings → Language. Changing the language writes both the durable per-user
// preference (user_settings.language, via /api/user-settings) and the gh-locale
// cookie that next-intl reads, then refreshes so the server re-renders in the
// chosen language. LanguageSync keeps the two in step across devices.

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { GpRow, GpSubHeader, GpDropdown } from "./primitives";
import { LOCALES, LOCALE_COOKIE, LOCALE_LABELS, type Locale } from "@/i18n/locales";

export default function SettingsLanguage() {
  const t = useTranslations("settings.language");
  const active = useLocale() as Locale;
  const [value, setValue] = useState<Locale>(active);
  const router = useRouter();

  const options = LOCALES.map((code) => ({
    value: code,
    label: `${LOCALE_LABELS[code].flag}  ${LOCALE_LABELS[code].label}`,
  }));

  async function change(next: string) {
    const locale = next as Locale;
    setValue(locale);
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    try {
      await fetch("/api/user-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: locale }),
      });
    } catch {
      /* cookie already set — the choice still applies for this device */
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <GpSubHeader>{t("heading")}</GpSubHeader>
        <GpRow label={t("rowLabel")} description={t("rowDescription")}>
          <GpDropdown value={value} options={options} onChange={change} width={260} />
        </GpRow>
      </div>
    </div>
  );
}
