// TheGamesDB — community game database. Free public API key from
// https://forums.thegamesdb.net/viewforum.php?f=10. Provides overview text,
// players, ESRB rating and a good spread of artwork (boxart, fanart, clear
// logo, banner, screenshots).
//
// Two calls per lookup: ByGameName resolves the game + text fields, then
// Games/Images pulls the artwork (base_url + filename → full URL). Developer /
// publisher / genre come back as numeric IDs (needing extra lookups), so we
// deliberately skip them — ScreenScraper/IGDB already cover those well.

import { ApiKeyConfig, MediaRefs } from "./config";
import { recordRateLimit, retryAfterSeconds } from "./quota";

const API = "https://api.thegamesdb.net/v1";

/** GameHub slug → TheGamesDB platform id. Only high-confidence ids are listed;
 *  an unmapped system searches without the platform filter (a wrong id would
 *  wrongly exclude the real match, so absence is safer than a guess). */
const TGDB_PLATFORM_IDS: Record<string, number> = {
  pc: 1,
  gamecube: 2,
  n64: 3,
  gb: 4,
  gba: 5,
  snes: 6,
  superfamicom: 6,
  nes: 7,
  famicom: 7,
  nds: 8,
  wii: 9,
  psx: 10,
  ps2: 11,
  ps3: 12,
  psp: 13,
  xbox: 14,
  xbox360: 15,
  dreamcast: 16,
  saturn: 17,
  genesis: 18,
  megadrive: 18,
  gg: 20,
  segacd: 21,
  megacd: 21,
  atari2600: 22,
  arcade: 23,
  neogeo: 24,
  "3do": 25,
  atari5200: 26,
  atari7800: 27,
  jaguar: 28,
  coleco: 31,
  intellivision: 32,
  sega32x: 33,
  pce: 34,
  pcengine: 34,
  sms: 35,
  mark3: 35,
  wiiu: 38,
  vita: 39,
  c64: 40,
  gbc: 41,
  "3ds": 4912,
  vb: 4918,
  ps4: 4919,
  ngp: 4922,
  ngpc: 4923,
  lynx: 4924,
  wonderswan: 4925,
  wonderswancolor: 4926,
  amiga: 4911,
  switch: 4971,
};

function ext(url: string): string {
  const m = url.match(/\.(png|jpe?g|webp|gif)(?:\?|$)/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

export interface TgdbResult {
  game?: {
    description?: string;
    players?: string;
    rating?: string;
    ageRating?: string;
    releaseDate?: string;
  };
  media: MediaRefs;
}

interface TgdbImage {
  type?: string;
  side?: string;
  filename?: string;
}

export async function tgdbLookup(
  config: ApiKeyConfig,
  title: string,
  platformSlug: string
): Promise<{ result?: TgdbResult; error?: string }> {
  if (!config.apiKey) return { error: "TheGamesDB: no API key" };
  const pid = TGDB_PLATFORM_IDS[platformSlug];

  const nameUrl =
    `${API}/Games/ByGameName?apikey=${encodeURIComponent(config.apiKey)}` +
    `&name=${encodeURIComponent(title)}&fields=players,overview,rating` +
    (pid ? `&filter%5Bplatform%5D=${pid}` : "");

  let res: Response;
  try {
    res = await fetch(nameUrl, { signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    return { error: `TheGamesDB unreachable: ${e instanceof Error ? e.message : e}` };
  }
  if (res.status === 429) {
    recordRateLimit("thegamesdb", retryAfterSeconds(res.headers.get("retry-after")));
    return { error: "TheGamesDB rate limit hit — skipping until it resets" };
  }
  if (res.status === 401 || res.status === 403) return { error: "TheGamesDB: invalid API key" };
  if (!res.ok) return { error: `TheGamesDB: HTTP ${res.status}` };

  const data = await res.json().catch(() => ({}));
  const g = data?.data?.games?.[0];
  if (!g?.id) return { error: "Not found on TheGamesDB" };

  const result: TgdbResult = {
    game: {
      description: typeof g.overview === "string" && g.overview.trim() ? g.overview.trim() : undefined,
      players: g.players ? String(g.players) : undefined,
      // TGDB `rating` is the ESRB classification string (e.g. "E - Everyone"),
      // not a score — surface it as the age rating.
      ageRating: typeof g.rating === "string" && g.rating.trim() && g.rating !== "Not Rated" ? g.rating : undefined,
      releaseDate: typeof g.release_date === "string" ? g.release_date : undefined,
    },
    media: {},
  };

  // Artwork: a second call, best-effort (text metadata already stands on its own).
  try {
    const imgUrl = `${API}/Games/Images?apikey=${encodeURIComponent(config.apiKey)}&games_id=${g.id}`;
    const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(30_000) });
    if (imgRes.ok) {
      const idata = await imgRes.json().catch(() => ({}));
      const base: string =
        idata?.data?.base_url?.original ?? "https://cdn.thegamesdb.net/images/original/";
      const list: TgdbImage[] = idata?.data?.images?.[String(g.id)] ?? [];
      const pick = (pred: (i: TgdbImage) => boolean) => {
        const hit = list.find(pred);
        if (!hit?.filename) return;
        const url = base + hit.filename;
        return { url, format: ext(url) };
      };
      const boxart = pick((i) => i.type === "boxart" && (i.side ?? "front") === "front");
      const fanart = pick((i) => i.type === "fanart");
      const logo = pick((i) => i.type === "clearlogo");
      const screenshot = pick((i) => i.type === "screenshot");
      const banner = pick((i) => i.type === "banner");
      if (boxart) result.media.boxart = boxart;
      if (fanart ?? banner) result.media.hero = (fanart ?? banner)!;
      if (logo) result.media.logo = logo;
      if (screenshot) result.media.screenshot = screenshot;
    }
  } catch {
    /* artwork is optional */
  }

  return { result };
}

export async function tgdbTest(config: ApiKeyConfig): Promise<{ ok: boolean; message: string }> {
  if (!config.apiKey) return { ok: false, message: "Enter your API key first" };
  try {
    const res = await fetch(
      `${API}/Games/ByGameName?apikey=${encodeURIComponent(config.apiKey)}&name=mario`,
      { signal: AbortSignal.timeout(20_000) }
    );
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const remaining = data?.remaining_monthly_allowance;
      return {
        ok: true,
        message:
          remaining !== undefined
            ? `Connected — ${remaining} requests left this month`
            : "Connected — API key accepted",
      };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, message: "Invalid API key" };
    return { ok: false, message: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
