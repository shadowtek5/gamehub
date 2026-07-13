// Language detection from No-Intro/Redump-style filenames: "(En,Fr,De)"
// tags win; otherwise the region implies the language (USA -> En, Japan -> Ja).

/** No-Intro code -> full display name (dropdowns show names, filters use codes) */
export const LANGUAGE_NAMES: Record<string, string> = {
  En: "English",
  Ja: "Japanese",
  Fr: "French",
  De: "German",
  Es: "Spanish",
  It: "Italian",
  Nl: "Dutch",
  Pt: "Portuguese",
  Sv: "Swedish",
  No: "Norwegian",
  Da: "Danish",
  Fi: "Finnish",
  Zh: "Chinese",
  Ko: "Korean",
  Pl: "Polish",
  Ru: "Russian",
  Cs: "Czech",
  Hu: "Hungarian",
  El: "Greek",
  Tr: "Turkish",
  Ar: "Arabic",
  He: "Hebrew",
  Ca: "Catalan",
  Hr: "Croatian",
  Sk: "Slovak",
  Sl: "Slovenian",
  Ro: "Romanian",
  Bg: "Bulgarian",
  Uk: "Ukrainian",
  Th: "Thai",
  Vi: "Vietnamese",
  Id: "Indonesian",
};

const LANG_CODES = new Set(Object.keys(LANGUAGE_NAMES));

/** Language code -> flag country code (flagcdn.com) for cover badges */
export const LANGUAGE_FLAGS: Record<string, string> = {
  Ja: "jp",
  Fr: "fr",
  De: "de",
  Es: "es",
  It: "it",
  Nl: "nl",
  Pt: "pt",
  Sv: "se",
  No: "no",
  Da: "dk",
  Fi: "fi",
  Zh: "cn",
  Ko: "kr",
  Pl: "pl",
  Ru: "ru",
  Cs: "cz",
  Hu: "hu",
  El: "gr",
  Tr: "tr",
  Ar: "sa",
  He: "il",
  Ca: "es",
  Hr: "hr",
  Sk: "sk",
  Sl: "si",
  Ro: "ro",
  Bg: "bg",
  Uk: "ua",
  Th: "th",
  Vi: "vn",
  Id: "id",
};

/** Comma-joined language codes ("En,Fr,De") or null when undeterminable */
export function parseLanguages(filename: string, region?: string | null): string | null {
  const groups = filename.match(/\(([^)]+)\)/g) ?? [];
  for (const g of groups) {
    const parts = g
      .slice(1, -1)
      .split(/[,+]/)
      .map((p) => p.trim());
    if (parts.length > 0 && parts.every((p) => LANG_CODES.has(p))) {
      return [...new Set(parts)].join(",");
    }
  }

  const r = `${region ?? ""} ${filename}`.toLowerCase();
  if (/\bjapan\b|\(j\)|\bjpn\b/.test(r)) return "Ja";
  if (/\busa\b|\bworld\b|\beurope\b|\baustralia\b|\bcanada\b|\buk\b|\(u\)|\(e\)|\(ue\)|\(ju\)/.test(r)) {
    return "En";
  }
  if (/\bfrance\b/.test(r)) return "Fr";
  if (/\bgermany\b/.test(r)) return "De";
  if (/\bspain\b/.test(r)) return "Es";
  if (/\bitaly\b/.test(r)) return "It";
  if (/\bkorea\b/.test(r)) return "Ko";
  if (/\bchina\b|\btaiwan\b|\bhong kong\b/.test(r)) return "Zh";
  if (/\bbrazil\b/.test(r)) return "Pt";
  if (/\bnetherlands\b/.test(r)) return "Nl";
  if (/\brussia\b/.test(r)) return "Ru";
  return null;
}
