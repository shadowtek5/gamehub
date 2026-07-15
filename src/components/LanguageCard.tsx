"use client";

// Language switcher card for the Account (desktop) and Profile (mobile) screens
// — the switcher every user can reach, since the full Settings shell is
// admin-only. Same behavior as Settings › Language: writes the durable per-user
// preference (user_settings.language) and the gh-locale cookie, then refreshes.

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { GpDropdown } from "@/components/bpm/primitives";
import { LOCALES_FOR_PICKER, LOCALE_COOKIE, LOCALE_LABELS, type Locale } from "@/i18n/locales";

export default function LanguageCard() {
  const t = useTranslations("settings.language");
  const active = useLocale() as Locale;
  const [value, setValue] = useState<Locale>(active);
  const router = useRouter();

  const options = LOCALES_FOR_PICKER.map((code) => ({
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
    <div className="panel flex items-center justify-between gap-4 p-5 sm:p-6">
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent ring-1 ring-white/10">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold uppercase tracking-widest text-bright">{t("rowLabel")}</div>
          <div className="mt-0.5 text-[13px] text-dim">{t("rowDescription")}</div>
        </div>
      </div>
      <div className="shrink-0">
        <GpDropdown value={value} options={options} onChange={change} width={220} />
      </div>
    </div>
  );
}
