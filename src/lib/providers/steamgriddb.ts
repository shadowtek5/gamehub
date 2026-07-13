// SteamGridDB — community-made high-quality covers (grids) and wide hero
// banners. Free API key from https://www.steamgriddb.com/profile/preferences/api
// Artwork only: no metadata, no videos.

import { ApiKeyConfig, MediaRefs } from "./config";
import { recordRateLimit, retryAfterSeconds } from "./quota";

const BASE = "https://www.steamgriddb.com/api/v2";

async function api(config: ApiKeyConfig, path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401) throw new Error("Invalid API key");
  if (res.status === 429) {
    recordRateLimit("steamgriddb", retryAfterSeconds(res.headers.get("retry-after")));
    throw new Error("Rate limited");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.success) throw new Error("API error");
  return data.data;
}

function ext(url: string): string {
  const m = url.match(/\.(png|jpe?g|webp|ico)(?:\?|$)/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "png";
}

export interface SgdbResult {
  media: MediaRefs;
}

export async function sgdbLookup(
  config: ApiKeyConfig,
  title: string
): Promise<{ result?: SgdbResult; error?: string }> {
  try {
    const games = (await api(
      config,
      `/search/autocomplete/${encodeURIComponent(title)}`
    )) as { id: number; name: string }[];
    const game = games?.[0];
    if (!game) return { error: "Not found on SteamGridDB" };

    const result: SgdbResult = { media: {} };

    // 600x900 grids are box-art shaped
    try {
      const grids = (await api(
        config,
        `/grids/game/${game.id}?dimensions=600x900,342x482&types=static&limit=1`
      )) as { url: string }[];
      if (grids?.[0]?.url) {
        result.media.boxart = { url: grids[0].url, format: ext(grids[0].url) };
      }
    } catch {}

    // Heroes: wide banner art for the game-page header
    try {
      const heroes = (await api(
        config,
        `/heroes/game/${game.id}?types=static&limit=1`
      )) as { url: string }[];
      if (heroes?.[0]?.url) {
        result.media.hero = { url: heroes[0].url, format: ext(heroes[0].url) };
      }
    } catch {}

    // Square icons
    try {
      const icons = (await api(
        config,
        `/icons/game/${game.id}?types=static&limit=1`
      )) as { url: string }[];
      if (icons?.[0]?.url) {
        result.media.icon = { url: icons[0].url, format: ext(icons[0].url) };
      }
    } catch {}

    // Clear logos: transparent game-title art (ideal for a themeable hero)
    try {
      const logos = (await api(
        config,
        `/logos/game/${game.id}?types=static&limit=1`
      )) as { url: string }[];
      if (logos?.[0]?.url) {
        result.media.logo = { url: logos[0].url, format: ext(logos[0].url) };
      }
    } catch {}

    if (
      !result.media.boxart &&
      !result.media.hero &&
      !result.media.icon &&
      !result.media.logo
    ) {
      return { error: "No artwork on SteamGridDB for this game" };
    }
    return { result };
  } catch (e) {
    return { error: `SteamGridDB: ${e instanceof Error ? e.message : e}` };
  }
}

/** Multiple hero-banner candidates for the picker UI */
export async function sgdbHeroList(
  config: ApiKeyConfig,
  title: string,
  limit = 12
): Promise<{ urls: string[]; error?: string }> {
  try {
    const games = (await api(
      config,
      `/search/autocomplete/${encodeURIComponent(title)}`
    )) as { id: number }[];
    const game = games?.[0];
    if (!game) return { urls: [], error: "Not found on SteamGridDB" };
    const heroes = (await api(
      config,
      `/heroes/game/${game.id}?types=static&limit=${limit}`
    )) as { url: string }[];
    return { urls: (heroes ?? []).map((h) => h.url).filter(Boolean) };
  } catch (e) {
    return { urls: [], error: `SteamGridDB: ${e instanceof Error ? e.message : e}` };
  }
}

export async function sgdbLogoList(
  config: ApiKeyConfig,
  title: string,
  limit = 12
): Promise<{ urls: string[]; error?: string }> {
  try {
    const games = (await api(
      config,
      `/search/autocomplete/${encodeURIComponent(title)}`
    )) as { id: number }[];
    const game = games?.[0];
    if (!game) return { urls: [], error: "Not found on SteamGridDB" };
    const logos = (await api(
      config,
      `/logos/game/${game.id}?types=static&limit=${limit}`
    )) as { url: string }[];
    return { urls: (logos ?? []).map((l) => l.url).filter(Boolean) };
  } catch (e) {
    return { urls: [], error: `SteamGridDB: ${e instanceof Error ? e.message : e}` };
  }
}

/** Multiple game matches for a search term — lets callers aggregate art across
 *  several entries (e.g. a console that has both "NES" and "Famicom" pages). */
export async function sgdbSearchGames(
  config: ApiKeyConfig,
  term: string,
  limit = 5
): Promise<{ games: { id: number; name: string }[]; error?: string }> {
  try {
    const games = (await api(
      config,
      `/search/autocomplete/${encodeURIComponent(term)}`
    )) as { id: number; name: string }[] | null;
    return { games: (games ?? []).slice(0, limit) };
  } catch (e) {
    return { games: [], error: `SteamGridDB: ${e instanceof Error ? e.message : e}` };
  }
}

const ASSET_PATH = {
  hero: (id: number, n: number) => `/heroes/game/${id}?types=static&limit=${n}`,
  logo: (id: number, n: number) => `/logos/game/${id}?types=static&limit=${n}`,
  grid: (id: number, n: number) => `/grids/game/${id}?types=static&limit=${n}`,
  icon: (id: number, n: number) => `/icons/game/${id}?types=static&limit=${n}`,
} as const;

/** Every static asset of one kind for a game (hero/logo/grid/icon). */
export async function sgdbAssetList(
  config: ApiKeyConfig,
  gameId: number,
  kind: "hero" | "logo" | "grid" | "icon",
  limit = 24
): Promise<string[]> {
  try {
    const assets = (await api(config, ASSET_PATH[kind](gameId, limit))) as { url: string }[];
    return (assets ?? []).map((a) => a.url).filter(Boolean);
  } catch {
    return [];
  }
}

export async function sgdbTest(config: ApiKeyConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const games = (await api(config, "/search/autocomplete/mario")) as unknown[];
    return { ok: true, message: `Connected — search OK (${games.length} results)` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
