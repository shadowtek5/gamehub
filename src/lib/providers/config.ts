import { getSetting, setSetting } from "../db";
import { getEmbeddedSsDev } from "./ssdev";
import { seal, open, isSealed } from "../secretbox";

/** Every downloadable media slot a provider can fill. Shared by all providers
 *  so the scrape orchestrator can index any provider's media map by any key. */
export const MEDIA_KEYS = [
  "boxart",
  "screenshot",
  "hero",
  "icon",
  "video",
  "manual",
  "logo",
  "publisher_logo",
  "developer_logo",
  "rating_logo",
] as const;
export type MediaKey = (typeof MEDIA_KEYS)[number];

/** A downloadable reference: remote URL + the file extension to save it as. */
export type MediaRef = { url: string; format: string };
export type MediaRefs = Partial<Record<MediaKey, MediaRef>>;

export interface ScreenScraperConfig {
  devid: string;
  devpassword: string;
  softname: string;
  ssid: string;
  sspassword: string;
}

export interface EmuMoviesConfig {
  username: string;
  password: string;
}

export interface IgdbConfig {
  clientId: string;
  clientSecret: string;
}

export interface ApiKeyConfig {
  apiKey: string;
}

export interface ProviderConfig {
  screenscraper: ScreenScraperConfig;
  emumovies: EmuMoviesConfig;
  igdb: IgdbConfig;
  mobygames: ApiKeyConfig;
  steamgriddb: ApiKeyConfig;
  thegamesdb: ApiKeyConfig;
}

const DEFAULTS: ProviderConfig = {
  screenscraper: { devid: "", devpassword: "", softname: "GameHub", ssid: "", sspassword: "" },
  emumovies: { username: "", password: "" },
  igdb: { clientId: "", clientSecret: "" },
  mobygames: { apiKey: "" },
  steamgriddb: { apiKey: "" },
  thegamesdb: { apiKey: "" },
};

/** Exactly what's saved in the database — no env or embedded credentials
 *  mixed in. This is what the settings API reads and writes so built-in
 *  secrets can never leak into the DB or an API response.
 *
 *  Credentials are sealed at rest (AES-256-GCM, see secretbox). A legacy
 *  plaintext value (pre-encryption installs) is read transparently and
 *  re-sealed on the spot so it never lingers in the clear. */
export function getStoredProviderConfig(): ProviderConfig {
  const raw = getSetting("providers");
  if (!raw) return structuredClone(DEFAULTS);
  const json = open(raw);
  // One-time migration: an existing plaintext blob gets sealed immediately.
  if (json && !isSealed(raw)) {
    try {
      setSetting("providers", seal(json));
    } catch {
      // best-effort; falls through to parse the plaintext we already read
    }
  }
  if (!json) return structuredClone(DEFAULTS);
  try {
    const parsed = JSON.parse(json);
    return {
      screenscraper: { ...DEFAULTS.screenscraper, ...(parsed.screenscraper ?? {}) },
      emumovies: { ...DEFAULTS.emumovies, ...(parsed.emumovies ?? {}) },
      igdb: { ...DEFAULTS.igdb, ...(parsed.igdb ?? {}) },
      mobygames: { ...DEFAULTS.mobygames, ...(parsed.mobygames ?? {}) },
      steamgriddb: { ...DEFAULTS.steamgriddb, ...(parsed.steamgriddb ?? {}) },
      thegamesdb: { ...DEFAULTS.thegamesdb, ...(parsed.thegamesdb ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function getProviderConfig(): ProviderConfig {
  const config = getStoredProviderConfig();
  // App (developer) credentials resolve DB → env vars → encrypted embedded
  // blob, so users only ever enter their own ScreenScraper username/password.
  if (!config.screenscraper.devid && process.env.SCREENSCRAPER_DEVID) {
    config.screenscraper.devid = process.env.SCREENSCRAPER_DEVID;
  }
  if (!config.screenscraper.devpassword && process.env.SCREENSCRAPER_DEVPASSWORD) {
    config.screenscraper.devpassword = process.env.SCREENSCRAPER_DEVPASSWORD;
  }
  if (!config.screenscraper.devid || !config.screenscraper.devpassword) {
    const embedded = getEmbeddedSsDev();
    if (embedded) {
      if (!config.screenscraper.devid) config.screenscraper.devid = embedded.devid;
      if (!config.screenscraper.devpassword) config.screenscraper.devpassword = embedded.devpassword;
    }
  }
  return config;
}

export function setProviderConfig(config: ProviderConfig) {
  // Sealed at rest so credentials never sit in the DB (or a backup) in plaintext.
  setSetting("providers", seal(JSON.stringify(config)));
}

export function screenscraperConfigured(c = getProviderConfig()): boolean {
  return !!(c.screenscraper.devid && c.screenscraper.devpassword);
}

export function emumoviesConfigured(c = getProviderConfig()): boolean {
  return !!(c.emumovies.username && c.emumovies.password);
}

export function igdbConfigured(c = getProviderConfig()): boolean {
  return !!(c.igdb.clientId && c.igdb.clientSecret);
}

export function mobygamesConfigured(c = getProviderConfig()): boolean {
  return !!c.mobygames.apiKey;
}

export function steamgriddbConfigured(c = getProviderConfig()): boolean {
  return !!c.steamgriddb.apiKey;
}

export function thegamesdbConfigured(c = getProviderConfig()): boolean {
  return !!c.thegamesdb.apiKey;
}

// ---------- scraper options: provider priority + which items to scrape ----------

export const PROVIDER_IDS = [
  "screenscraper",
  "emumovies",
  "igdb",
  "mobygames",
  "thegamesdb",
  "steamgriddb",
  "launchbox",
  "libretro",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ScraperItems {
  description: boolean;
  // developer, publisher, genre, players, rating, release date, age rating,
  // language, region, franchise, game modes, perspectives, themes
  details: boolean;
  boxart: boolean;
  hero: boolean; // wide banner art
  logo: boolean; // clear-logo / wheel art (transparent game title)
  icon: boolean;
  screenshot: boolean;
  video: boolean;
  manual: boolean; // PDF game manual
  badges: boolean; // developer, publisher & age-rating logo images
}

export interface ScraperOptions {
  /** Provider ids in priority order — first provider that has an item wins */
  priority: ProviderId[];
  /** Per-item provider preference. A media item listed here takes that provider
   *  FIRST regardless of the global order, then falls through the normal
   *  priority list if the preferred provider has nothing. Omitted items just
   *  follow `priority`. E.g. { boxart: "screenscraper", hero: "steamgriddb" }. */
  itemProviders: Partial<Record<MediaKey, ProviderId>>;
  items: ScraperItems;
  /** Exact-match games by file hash via Hasheous before scraping (needs IGDB) */
  hashMatching: boolean;
  /** ScreenScraper box art style */
  boxStyle: "2d" | "3d";
  /** How many ROMs a bulk scrape processes at once. Capped at runtime to the
   *  ScreenScraper account's sanctioned thread count, so a high value here is
   *  safe — it just means "use as many threads as my account allows". */
  maxConcurrency: number;
}

export const MAX_CONCURRENCY_CAP = 20;

/** Clamp a requested concurrency into the sane 1..cap range (default 3). */
export function clampConcurrency(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(MAX_CONCURRENCY_CAP, n));
}

const DEFAULT_OPTIONS: ScraperOptions = {
  // Consulted top-to-bottom; first provider with an item wins. LaunchBox first
  // (local DB — metadata + art for nearly everything), then the online scrapers,
  // with the generator/aggregator sources (SteamGridDB, libretro) last so they
  // only fill whatever the primaries were missing.
  priority: [
    "launchbox",
    "screenscraper",
    "emumovies",
    "igdb",
    "mobygames",
    "thegamesdb",
    "steamgriddb",
    "libretro",
  ],
  itemProviders: {},
  items: {
    description: true,
    details: true,
    boxart: true,
    hero: true,
    logo: true,
    icon: true,
    screenshot: true,
    video: true,
    // Off by default: manuals are multi-MB PDFs that dramatically slow bulk
    // scrapes — enable in Settings → Scraping, or use per-game Fetch manual
    manual: false,
    badges: true,
  },
  hashMatching: true,
  boxStyle: "2d",
  maxConcurrency: 3,
};

function sanitizePriority(value: unknown): ProviderId[] {
  const list = Array.isArray(value)
    ? value.filter((p): p is ProviderId => PROVIDER_IDS.includes(p))
    : [];
  for (const p of PROVIDER_IDS) if (!list.includes(p)) list.push(p);
  return list;
}

/** Keep only well-formed { mediaKey: providerId } entries — a stray key or an
 *  unknown provider is dropped rather than trusted into the scrape engine. */
function sanitizeItemProviders(value: unknown): Partial<Record<MediaKey, ProviderId>> {
  const out: Partial<Record<MediaKey, ProviderId>> = {};
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (
        (MEDIA_KEYS as readonly string[]).includes(k) &&
        PROVIDER_IDS.includes(v as ProviderId)
      ) {
        out[k as MediaKey] = v as ProviderId;
      }
    }
  }
  return out;
}

export function getScraperOptions(): ScraperOptions {
  const raw = getSetting("scraper_options");
  if (!raw) return structuredClone(DEFAULT_OPTIONS);
  try {
    const parsed = JSON.parse(raw);
    return {
      priority: sanitizePriority(parsed.priority),
      itemProviders: sanitizeItemProviders(parsed.itemProviders),
      items: { ...DEFAULT_OPTIONS.items, ...(parsed.items ?? {}) },
      hashMatching: parsed.hashMatching !== false,
      boxStyle: parsed.boxStyle === "3d" ? "3d" : "2d",
      maxConcurrency:
        parsed.maxConcurrency === undefined
          ? DEFAULT_OPTIONS.maxConcurrency
          : clampConcurrency(parsed.maxConcurrency),
    };
  } catch {
    return structuredClone(DEFAULT_OPTIONS);
  }
}

export function setScraperOptions(options: ScraperOptions) {
  setSetting(
    "scraper_options",
    JSON.stringify({
      priority: sanitizePriority(options.priority),
      itemProviders: sanitizeItemProviders(options.itemProviders),
      items: { ...DEFAULT_OPTIONS.items, ...options.items },
      hashMatching: options.hashMatching !== false,
      boxStyle: options.boxStyle === "3d" ? "3d" : "2d",
      maxConcurrency: clampConcurrency(options.maxConcurrency),
    })
  );
}
