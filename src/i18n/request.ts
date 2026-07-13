import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, matchAcceptLanguage } from "./locales";

// next-intl "without i18n routing": the active locale comes from the
// gh-locale cookie (set by proxy.ts / the in-app switcher). On the very first
// request the cookie proxy.ts sets isn't visible to this render yet, so we fall
// back to negotiating Accept-Language directly. Messages live in
// src/messages/<locale>.json.

type Messages = Record<string, unknown>;

// Deep-merge locale messages over the English base so any key a locale hasn't
// translated yet gracefully renders the English string instead of the raw key
// path. Lets partially-translated locales ship without visible gaps.
function mergeDeep(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(override)) {
    const b = out[k];
    if (v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" && !Array.isArray(b)) {
      out[k] = mergeDeep(b as Messages, v as Messages);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export default getRequestConfig(async () => {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie)
    ? cookie
    : matchAcceptLanguage((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;

  const en = (await import("../messages/en.json")).default as Messages;
  const messages =
    locale === DEFAULT_LOCALE
      ? en
      : mergeDeep(en, (await import(`../messages/${locale}.json`)).default as Messages);

  return { locale, messages };
});
