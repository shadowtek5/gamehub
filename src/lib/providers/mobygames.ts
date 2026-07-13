// MobyGames — game metadata + sample cover/screenshots.
// Free API key from https://www.mobygames.com/info/api/ (rate-limited:
// 360 requests/hour, so bulk scrapes lean on it last by default).

import { ApiKeyConfig, MediaRefs } from "./config";
import { recordRateLimit, retryAfterSeconds } from "./quota";

/** GameHub platform slug -> MobyGames platform id */
const MOBY_PLATFORM_IDS: Record<string, number> = {
  nes: 22,
  snes: 15,
  n64: 9,
  gb: 10,
  gbc: 11,
  gba: 12,
  nds: 44,
  genesis: 16,
  sms: 26,
  gg: 25,
  psx: 6,
  atari2600: 28,
  pce: 40,
  vb: 38,
  "3ds": 101,
  gamecube: 14,
  wii: 82,
  wiiu: 132,
  switch: 203,
  segacd: 20,
  sega32x: 21,
  saturn: 23,
  dreamcast: 8,
  ps2: 7,
  ps3: 81,
  psp: 46,
  vita: 105,
  atari5200: 33,
  atari7800: 34,
  lynx: 18,
  jaguar: 17,
  ngp: 52,
  wonderswan: 48,
  coleco: 29,
  intellivision: 30,
  pcfx: 59,
  pcecd: 45,
  arcade: 143,
  neogeo: 36,
  "3do": 35,
  msx: 57,
  c64: 27,
  amiga: 19,
  dos: 2,
  vectrex: 37,
  atari800: 39,
  appleii: 31,
  acpc: 60,
  zxspectrum: 41,
  sg1000: 114,
  supergrafx: 127,
  famicom: 22,
  fds: 22,
  atarist: 24,
  cd32: 56,
  msx2: 57,
  superfamicom: 15,
  megadrive: 16,
  megacd: 20,
  mark3: 26,
  pcengine: 40,
  pcenginecd: 45,
  vic20: 43,
  cdi: 73,
  xbox: 13,
  xbox360: 69,
  channelf: 76,
  odyssey2: 78,
  bbcmicro: 92,
  electron: 93,
};

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export interface MobyResult {
  game?: {
    description?: string;
    genre?: string;
    rating?: string;
    releaseDate?: string;
  };
  media: MediaRefs;
}

function ext(url: string): string {
  const m = url.match(/\.(png|jpe?g|webp|gif)(?:\?|$)/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

export async function mobyLookup(
  config: ApiKeyConfig,
  title: string,
  platformSlug: string
): Promise<{ result?: MobyResult; error?: string }> {
  const pid = MOBY_PLATFORM_IDS[platformSlug];
  if (!pid) return { error: `MobyGames: unsupported platform "${platformSlug}"` };

  let res: Response;
  try {
    res = await fetch(
      `https://api.mobygames.com/v1/games?title=${encodeURIComponent(title)}&platform=${pid}&limit=1&format=normal&api_key=${encodeURIComponent(config.apiKey)}`,
      { signal: AbortSignal.timeout(30_000) }
    );
  } catch (e) {
    return { error: `MobyGames unreachable: ${e instanceof Error ? e.message : e}` };
  }
  if (res.status === 429) {
    recordRateLimit("mobygames", retryAfterSeconds(res.headers.get("retry-after")));
    return { error: "MobyGames rate limit hit — skipping until it resets" };
  }
  if (!res.ok) return { error: `MobyGames: HTTP ${res.status}` };

  const data = await res.json().catch(() => ({}));
  const g = data?.games?.[0];
  if (!g) return { error: "Not found on MobyGames" };

  const platformEntry = (g.platforms as { platform_id?: number; first_release_date?: string }[] | undefined)?.find(
    (p) => p.platform_id === pid
  );

  const result: MobyResult = {
    game: {
      description: typeof g.description === "string" ? stripHtml(g.description) : undefined,
      genre:
        (g.genres as { genre_name?: string }[] | undefined)
          ?.map((x) => x.genre_name)
          .filter(Boolean)
          .join(", ") || undefined,
      rating: typeof g.moby_score === "number" ? `${g.moby_score}/10` : undefined,
      releaseDate: platformEntry?.first_release_date ?? undefined,
    },
    media: {},
  };

  const cover = g.sample_cover?.image;
  if (typeof cover === "string") result.media.boxart = { url: cover, format: ext(cover) };
  const shot = g.sample_screenshots?.[0]?.image;
  if (typeof shot === "string") result.media.screenshot = { url: shot, format: ext(shot) };

  return { result };
}

export async function mobyTest(config: ApiKeyConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(
      `https://api.mobygames.com/v1/genres?api_key=${encodeURIComponent(config.apiKey)}`,
      { signal: AbortSignal.timeout(20_000) }
    );
    if (res.ok) return { ok: true, message: "Connected — API key accepted" };
    if (res.status === 401) return { ok: false, message: "Invalid API key" };
    return { ok: false, message: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
