// Supported UI locales for GameHub's interface (distinct from ROM-file
// language tags in src/lib/language.ts — those describe game content, these
// translate the app chrome). Locale is stored in the `gh-locale` cookie and
// persisted per-user under user_settings.language. No URL segment is used.

export const LOCALES = [
  "en",
  "ar",
  "da",
  "de",
  "el",
  "es",
  "fi",
  "fr",
  "it",
  "ja",
  "ko",
  "nl",
  "no",
  "pl",
  "pt",
  "ru",
  "sr",
  "sv",
  "zh",
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Name of the cookie next-intl reads to pick the active locale. */
export const LOCALE_COOKIE = "gh-locale";

/** Right-to-left locales — drives the <html dir> attribute. */
export const RTL_LOCALES = new Set<Locale>(["ar"]);

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

/** Native display names shown in the language switcher, with a flag emoji. */
export const LOCALE_LABELS: Record<Locale, { label: string; flag: string }> = {
  en: { label: "English", flag: "🇬🇧" },
  ar: { label: "العربية", flag: "🇸🇦" },
  da: { label: "Dansk", flag: "🇩🇰" },
  de: { label: "Deutsch", flag: "🇩🇪" },
  el: { label: "Ελληνικά", flag: "🇬🇷" },
  es: { label: "Español", flag: "🇪🇸" },
  fi: { label: "Suomi", flag: "🇫🇮" },
  fr: { label: "Français", flag: "🇫🇷" },
  it: { label: "Italiano", flag: "🇮🇹" },
  ja: { label: "日本語", flag: "🇯🇵" },
  ko: { label: "한국어", flag: "🇰🇷" },
  nl: { label: "Nederlands", flag: "🇳🇱" },
  no: { label: "Norsk", flag: "🇳🇴" },
  pl: { label: "Polski", flag: "🇵🇱" },
  pt: { label: "Português", flag: "🇵🇹" },
  ru: { label: "Русский", flag: "🇷🇺" },
  sr: { label: "Српски", flag: "🇷🇸" },
  sv: { label: "Svenska", flag: "🇸🇪" },
  zh: { label: "中文", flag: "🇨🇳" },
};

/** Locale codes ordered for the language switcher: English first, then the rest
 *  A→Z by their native display name — so the visible list reads alphabetically
 *  to a user instead of by ISO code (which put "Suomi" before "Français", etc.). */
export const LOCALES_FOR_PICKER: readonly Locale[] = [
  "en",
  ...LOCALES.filter((l) => l !== "en").sort((a, b) =>
    LOCALE_LABELS[a].label.localeCompare(LOCALE_LABELS[b].label)
  ),
];

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * Pick the best supported locale for an Accept-Language header value.
 * Matches exact tags first, then the primary subtag (pt-BR → pt, en-US → en).
 * Returns null when nothing matches so callers can fall back.
 */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const wanted = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .filter((p) => p.tag)
    .sort((a, b) => b.q - a.q);

  const byLower = new Map(LOCALES.map((l) => [l.toLowerCase(), l] as const));

  for (const { tag } of wanted) {
    const exact = byLower.get(tag);
    if (exact) return exact;
    const primary = tag.split("-")[0];
    // pt-BR → pt, es-419 → es, zh-Hans → zh, etc.
    const hit = LOCALES.find((l) => l.toLowerCase().split("-")[0] === primary);
    if (hit) return hit;
  }
  return null;
}
