// IGDB (igdb.com, owned by Twitch) — rich game metadata + covers/screenshots.
// Free: create an app at https://dev.twitch.tv/console/apps to get a
// Client ID + Client Secret; tokens are fetched and cached automatically.

import { IgdbConfig, MediaRefs } from "./config";
import { recordRateLimit, retryAfterSeconds } from "./quota";

/** Note a 429 from IGDB so the scraper skips it until the cooldown passes. */
function igdb429(res: Response): void {
  if (res.status === 429) recordRateLimit("igdb", retryAfterSeconds(res.headers.get("retry-after")));
}

/** GameHub platform slug -> IGDB platform id */
const IGDB_PLATFORM_IDS: Record<string, number> = {
  nes: 18,
  snes: 19,
  n64: 4,
  gb: 33,
  gbc: 22,
  gba: 24,
  nds: 20,
  genesis: 29,
  sms: 64,
  gg: 35,
  psx: 7,
  atari2600: 59,
  pce: 86,
  vb: 87,
  "3ds": 37,
  gamecube: 21,
  wii: 5,
  wiiu: 41,
  switch: 130,
  segacd: 78,
  sega32x: 30,
  saturn: 32,
  dreamcast: 23,
  ps2: 8,
  ps3: 9,
  psp: 38,
  vita: 46,
  atari5200: 66,
  atari7800: 60,
  lynx: 61,
  jaguar: 62,
  ngp: 119,
  wonderswan: 57,
  coleco: 68,
  intellivision: 67,
  pcecd: 150,
  arcade: 52,
  neogeo: 80,
  "3do": 50,
  msx: 27,
  c64: 15,
  amiga: 16,
  dos: 13,
  vectrex: 70,
  atari800: 65,
  appleii: 75,
  acpc: 25,
  zxspectrum: 26,
  sg1000: 84,
  vic20: 71,
  famicom: 18,
  fds: 51,
  atarist: 63,
  cd32: 114,
  superfamicom: 58,
  megadrive: 29,
  megacd: 78,
  mark3: 64,
  pcengine: 86,
  pcenginecd: 150,
  cdi: 117,
  xbox: 11,
  xbox360: 12,
  channelf: 127,
  odyssey2: 133,
  ouya: 72,
  pokemini: 166,
};

const globalToken = globalThis as unknown as {
  __igdbToken?: { token: string; expiresAt: number; clientId: string };
};

async function getToken(config: IgdbConfig): Promise<string> {
  const cached = globalToken.__igdbToken;
  if (
    cached &&
    cached.clientId === config.clientId &&
    Date.now() < cached.expiresAt - 60_000
  ) {
    return cached.token;
  }
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(
      config.clientId
    )}&client_secret=${encodeURIComponent(config.clientSecret)}&grant_type=client_credentials`,
    { method: "POST", signal: AbortSignal.timeout(20_000) }
  );
  if (!res.ok) throw new Error(`Twitch auth failed (HTTP ${res.status}) — check Client ID/Secret`);
  const data = await res.json();
  globalToken.__igdbToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    clientId: config.clientId,
  };
  return data.access_token;
}

export interface IgdbGameMeta {
  description?: string;
  developer?: string;
  publisher?: string;
  genre?: string;
  rating?: string;
  releaseDate?: string;
  franchise?: string;
  gameModes?: string;
  perspectives?: string;
  themes?: string;
  ageRating?: string;
  /** YouTube trailer link, e.g. https://www.youtube.com/watch?v=… */
  trailer?: string;
}

/** A related/similar game reference for the "More like this" section. */
export interface IgdbRelatedGame {
  name: string;
  cover?: string; // cover image URL
  url?: string; // igdb.com game page
}

/** An external link (official site, Wikipedia, Steam, subreddit, …). */
export interface IgdbLink {
  url: string;
  label: string;
}

/** IGDB relational content — none of it is available from other providers. */
export interface IgdbRelated {
  similar: IgdbRelatedGame[];
  /** DLC, expansions, remakes/remasters, ports, parent game — each tagged. */
  editions: (IgdbRelatedGame & { kind: string })[];
  links: IgdbLink[];
}

export interface IgdbResult {
  game?: IgdbGameMeta;
  media: MediaRefs;
  related?: IgdbRelated;
}

/** IgdbRelated after cross-referencing the local library: each game may carry a
 *  `romId` (present when that title is owned) so the card links into GameHub
 *  instead of out to IGDB. The current game is filtered out upstream. */
export interface IgdbRelatedResolved {
  similar: (IgdbRelatedGame & { romId?: number })[];
  editions: (IgdbRelatedGame & { kind: string; romId?: number })[];
  links: IgdbLink[];
}

interface IgdbCompany {
  company?: { name?: string; logo?: { image_id?: string } };
  developer?: boolean;
  publisher?: boolean;
}

interface IgdbAgeRating {
  category?: number;
  rating?: number;
  rating_cover_url?: string;
}

// IGDB age_ratings.category → rating authority
const IGDB_RATING_CAT: Record<number, string> = {
  1: "ESRB",
  2: "PEGI",
  3: "CERO",
  4: "USK",
  5: "GRAC",
  6: "CLASS_IND",
  7: "ACB",
};
// IGDB age_ratings.rating enum → label, for the two authorities we surface
const IGDB_ESRB: Record<number, string> = {
  6: "RP",
  7: "EC",
  8: "E",
  9: "E10+",
  10: "T",
  11: "M",
  12: "AO",
};
const IGDB_PEGI: Record<number, string> = { 1: "3", 2: "7", 3: "12", 4: "16", 5: "18" };

// IGDB websites.category enum → human label (only the ones worth surfacing)
const IGDB_SITE: Record<number, string> = {
  1: "Official site",
  3: "Wikipedia",
  6: "Twitch",
  9: "YouTube",
  13: "Steam",
  14: "Reddit",
  15: "itch.io",
  16: "Epic Games",
  17: "GOG",
  18: "Discord",
};

/** IGDB cover image URL at a card-friendly size. */
function coverUrl(id: string | undefined): string | undefined {
  return id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${id}.jpg` : undefined;
}

/** Map an IGDB game reference (from similar_games/dlcs/…) to a related-game card. */
function relGame(g: unknown): IgdbRelatedGame | null {
  const rec = g as { name?: string; slug?: string; cover?: { image_id?: string } } | undefined;
  if (!rec?.name) return null;
  return {
    name: rec.name,
    cover: coverUrl(rec.cover?.image_id),
    url: rec.slug ? `https://www.igdb.com/games/${rec.slug}` : undefined,
  };
}

/** Normalize IGDB's protocol-relative image URLs and bump to a larger size. */
function igdbImg(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return (url.startsWith("//") ? `https:${url}` : url).replace("t_thumb", "t_cover_big");
}

/** Prefer an ESRB rating, then PEGI; returns "ESRB: E" style text + a badge URL. */
function pickAgeRating(list: IgdbAgeRating[] | undefined): {
  text?: string;
  cover?: string;
} {
  if (!list?.length) return {};
  const esrb = list.find((a) => a.category === 1);
  const pegi = list.find((a) => a.category === 2);
  const chosen = esrb ?? pegi ?? list.find((a) => a.rating != null) ?? list[0];
  if (!chosen) return {};
  const authority = IGDB_RATING_CAT[chosen.category ?? 0];
  const label =
    chosen.category === 1
      ? IGDB_ESRB[chosen.rating ?? 0]
      : chosen.category === 2
        ? IGDB_PEGI[chosen.rating ?? 0]
        : undefined;
  // Prefer the ESRB/PEGI badge image even if we couldn't label the text
  const cover = igdbImg((esrb ?? pegi ?? chosen).rating_cover_url);
  return {
    text: authority && label ? `${authority}: ${label}` : undefined,
    cover,
  };
}

function joinNames(list: { name?: string }[] | undefined, limit = 6): string | undefined {
  const names = (list ?? []).map((x) => x.name).filter(Boolean) as string[];
  return names.length ? names.slice(0, limit).join(", ") : undefined;
}

export async function igdbLookup(
  config: IgdbConfig,
  title: string,
  platformSlug: string,
  /** Force a specific IGDB game (from igdbSearch) instead of title matching */
  gameId?: number
): Promise<{ result?: IgdbResult; error?: string }> {
  const pid = IGDB_PLATFORM_IDS[platformSlug];
  if (!pid && !gameId) return { error: `IGDB: unsupported platform "${platformSlug}"` };

  let token: string;
  try {
    token = await getToken(config);
  } catch (e) {
    return { error: `IGDB: ${e instanceof Error ? e.message : e}` };
  }

  const fields =
    "fields name,summary,genres.name,involved_companies.company.name,involved_companies.company.logo.image_id,involved_companies.developer,involved_companies.publisher,first_release_date,total_rating,game_modes.name,player_perspectives.name,themes.name,franchise.name,franchises.name,age_ratings.category,age_ratings.rating,age_ratings.rating_cover_url,videos.video_id,videos.name,cover.image_id,screenshots.image_id,artworks.image_id," +
    "similar_games.name,similar_games.slug,similar_games.cover.image_id," +
    "dlcs.name,dlcs.slug,dlcs.cover.image_id,expansions.name,expansions.slug,expansions.cover.image_id," +
    "standalone_expansions.name,standalone_expansions.slug,standalone_expansions.cover.image_id," +
    "remakes.name,remakes.slug,remakes.cover.image_id,remasters.name,remasters.slug,remasters.cover.image_id," +
    "ports.name,ports.slug,ports.cover.image_id,parent_game.name,parent_game.slug,parent_game.cover.image_id," +
    "expanded_games.name,expanded_games.slug,expanded_games.cover.image_id," +
    "bundles.name,bundles.slug,bundles.cover.image_id,forks.name,forks.slug,forks.cover.image_id," +
    "collections.name,collections.games.name,collections.games.slug,collections.games.cover.image_id," +
    "websites.url,websites.category;";
  const query = gameId
    ? `${fields} where id = ${gameId}; limit 1;`
    : `search "${title.replace(/["\\]/g, "")}"; ${fields} where platforms = (${pid}); limit 1;`;

  let res: Response;
  try {
    res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": config.clientId,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: query,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    return { error: `IGDB unreachable: ${e instanceof Error ? e.message : e}` };
  }
  if (!res.ok) { igdb429(res); return { error: `IGDB: HTTP ${res.status}` }; }

  const games = (await res.json().catch(() => [])) as Record<string, unknown>[];
  const g = games[0];
  if (!g) return { error: "Not found on IGDB" };

  const companies = (g.involved_companies ?? []) as IgdbCompany[];
  const devCo = companies.find((c) => c.developer);
  const pubCo = companies.find((c) => c.publisher);
  const genres = (g.genres as { name?: string }[] | undefined)
    ?.map((x) => x.name)
    .filter(Boolean)
    .join(", ");
  const franchise =
    (g.franchise as { name?: string } | undefined)?.name ??
    (g.franchises as { name?: string }[] | undefined)?.[0]?.name;
  const age = pickAgeRating(g.age_ratings as IgdbAgeRating[] | undefined);

  // IGDB videos are YouTube ids; prefer one named "Trailer", else take the first.
  const videos = (g.videos ?? []) as { video_id?: string; name?: string }[];
  const vid =
    videos.find((v) => v.video_id && /trailer/i.test(v.name ?? ""))?.video_id ??
    videos.find((v) => v.video_id)?.video_id;
  const trailer = vid ? `https://www.youtube.com/watch?v=${vid}` : undefined;

  const result: IgdbResult = {
    game: {
      description: typeof g.summary === "string" ? g.summary : undefined,
      developer: devCo?.company?.name,
      publisher: pubCo?.company?.name,
      genre: genres || undefined,
      rating:
        typeof g.total_rating === "number"
          ? `${Math.round(g.total_rating)}/100`
          : undefined,
      releaseDate:
        typeof g.first_release_date === "number"
          ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10)
          : undefined,
      franchise: franchise || undefined,
      gameModes: joinNames(g.game_modes as { name?: string }[] | undefined),
      perspectives: joinNames(g.player_perspectives as { name?: string }[] | undefined),
      themes: joinNames(g.themes as { name?: string }[] | undefined),
      ageRating: age.text,
      trailer,
    },
    media: {},
  };

  // Company logos + age-rating badge (stored for optional display)
  const logoUrl = (id?: string) =>
    id ? `https://images.igdb.com/igdb/image/upload/t_logo_med/${id}.png` : undefined;
  const devLogo = logoUrl(devCo?.company?.logo?.image_id);
  const pubLogo = logoUrl(pubCo?.company?.logo?.image_id);
  if (devLogo) result.media.developer_logo = { url: devLogo, format: "png" };
  if (pubLogo) result.media.publisher_logo = { url: pubLogo, format: "png" };
  if (age.cover) result.media.rating_logo = { url: age.cover, format: "png" };

  const coverId = (g.cover as { image_id?: string } | undefined)?.image_id;
  if (coverId) {
    result.media.boxart = {
      url: `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${coverId}.jpg`,
      format: "jpg",
    };
  }
  const shotId = (g.screenshots as { image_id?: string }[] | undefined)?.[0]?.image_id;
  if (shotId) {
    result.media.screenshot = {
      url: `https://images.igdb.com/igdb/image/upload/t_720p/${shotId}.jpg`,
      format: "jpg",
    };
  }
  // Promotional artworks are wide — ideal hero banners (fall back to a screenshot)
  const artId = (g.artworks as { image_id?: string }[] | undefined)?.[0]?.image_id ?? shotId;
  if (artId) {
    result.media.hero = {
      url: `https://images.igdb.com/igdb/image/upload/t_1080p/${artId}.jpg`,
      format: "jpg",
    };
  }

  // ---- Relational content (IGDB-exclusive: similar games, editions, links) ----
  const similar = ((g.similar_games as unknown[] | undefined) ?? [])
    .map(relGame)
    .filter((x): x is IgdbRelatedGame => !!x)
    .slice(0, 12);

  // Related games: every game-to-game relationship IGDB carries, each kind-tagged.
  // Order = specificity, so the dedupe below keeps the most meaningful label when
  // the same title appears under more than one relationship (e.g. a remaster that
  // is also listed in the collection).
  const REL_GROUPS: [string, string][] = [
    ["DLC", "dlcs"],
    ["Expansion", "expansions"],
    ["Expanded", "expanded_games"],
    ["Standalone", "standalone_expansions"],
    ["Remake", "remakes"],
    ["Remaster", "remasters"],
    ["Port", "ports"],
    ["Bundle", "bundles"],
    ["Mod", "forks"],
  ];
  const editionGroups: [string, unknown][] = REL_GROUPS.flatMap(([kind, key]) =>
    ((g[key] as unknown[] | undefined) ?? []).map((x) => [kind, x] as [string, unknown])
  );
  if (g.parent_game) editionGroups.unshift(["Part of", g.parent_game]);

  // Series siblings from the tightest IGDB "collection" (e.g. the "Final Fantasy
  // X" collection that groups FFX with FFX-2 and the HD remasters) — sequels and
  // side games that similar_games' taste algorithm routinely omits. A game is
  // often in both a tight sub-series and the sprawling franchise collection
  // (hundreds of games); prefer the smallest, and only when it's a curated size
  // so we never dump an entire franchise into the shelf.
  const cols = ((g.collections as { name?: string; games?: unknown[] }[] | undefined) ?? [])
    .filter((c) => Array.isArray(c.games) && c.games.length >= 2)
    .sort((a, b) => a.games!.length - b.games!.length);
  if (cols[0] && cols[0].games!.length <= 24) {
    for (const x of cols[0].games!) editionGroups.push(["Series", x]);
  }

  // Build cards; drop duplicate titles (keep the first, most specific kind).
  const seenEdition = new Set<string>();
  const editions = editionGroups
    .map(([kind, x]) => {
      const rg = relGame(x);
      return rg ? { ...rg, kind } : null;
    })
    .filter((x): x is IgdbRelatedGame & { kind: string } => {
      if (!x) return false;
      const k = x.name.toLowerCase();
      if (seenEdition.has(k)) return false;
      seenEdition.add(k);
      return true;
    })
    .slice(0, 24);

  const links = ((g.websites as { url?: string; category?: number }[] | undefined) ?? [])
    .filter((w) => w.url && IGDB_SITE[w.category ?? 0])
    .map((w) => ({ url: w.url!, label: IGDB_SITE[w.category!] }));

  if (similar.length || editions.length || links.length) {
    result.related = { similar, editions, links };
  }

  return { result };
}

export interface IgdbSearchHit {
  id: number;
  title: string;
  system?: string;
  year?: string;
}

/** Search games by name — for fixing an undetermined match */
export async function igdbSearch(
  config: IgdbConfig,
  query: string,
  platformSlug?: string
): Promise<{ hits: IgdbSearchHit[]; error?: string }> {
  let token: string;
  try {
    token = await getToken(config);
  } catch (e) {
    return { hits: [], error: `IGDB: ${e instanceof Error ? e.message : e}` };
  }
  const pid = platformSlug ? IGDB_PLATFORM_IDS[platformSlug] : undefined;
  const body = `search "${query.replace(/["\\]/g, "")}"; fields name,first_release_date,platforms.abbreviation;${pid ? ` where platforms = (${pid});` : ""} limit 20;`;
  let res: Response;
  try {
    res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": config.clientId,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    return { hits: [], error: `IGDB unreachable: ${e instanceof Error ? e.message : e}` };
  }
  if (!res.ok) { igdb429(res); return { hits: [], error: `IGDB: HTTP ${res.status}` }; }
  const games = (await res.json().catch(() => [])) as Record<string, unknown>[];
  const hits: IgdbSearchHit[] = [];
  for (const g of games) {
    const id = Number(g.id);
    if (!Number.isFinite(id) || id <= 0 || typeof g.name !== "string") continue;
    hits.push({
      id,
      title: g.name,
      system: (g.platforms as { abbreviation?: string }[] | undefined)
        ?.map((p) => p.abbreviation)
        .filter(Boolean)
        .slice(0, 3)
        .join(", "),
      year:
        typeof g.first_release_date === "number"
          ? String(new Date(g.first_release_date * 1000).getUTCFullYear())
          : undefined,
    });
  }
  return { hits };
}

/** Multiple wide-art candidates (artworks + screenshots) for the picker UI */
export async function igdbHeroList(
  config: IgdbConfig,
  title: string,
  platformSlug: string
): Promise<{ urls: string[]; error?: string }> {
  const pid = IGDB_PLATFORM_IDS[platformSlug];
  if (!pid) return { urls: [] };
  let token: string;
  try {
    token = await getToken(config);
  } catch (e) {
    return { urls: [], error: `IGDB: ${e instanceof Error ? e.message : e}` };
  }
  try {
    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": config.clientId,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: `search "${title.replace(/["\\]/g, "")}"; fields artworks.image_id,screenshots.image_id; where platforms = (${pid}); limit 1;`,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) { igdb429(res); return { urls: [], error: `IGDB: HTTP ${res.status}` }; }
    const games = (await res.json().catch(() => [])) as {
      artworks?: { image_id?: string }[];
      screenshots?: { image_id?: string }[];
    }[];
    const g = games[0];
    if (!g) return { urls: [], error: "Not found on IGDB" };
    const ids = [
      ...(g.artworks ?? []).map((a) => a.image_id),
      ...(g.screenshots ?? []).map((s) => s.image_id),
    ].filter(Boolean) as string[];
    return {
      urls: ids
        .slice(0, 10)
        .map((id) => `https://images.igdb.com/igdb/image/upload/t_1080p/${id}.jpg`),
    };
  } catch (e) {
    return { urls: [], error: `IGDB: ${e instanceof Error ? e.message : e}` };
  }
}

export async function igdbTest(config: IgdbConfig): Promise<{ ok: boolean; message: string }> {
  try {
    await getToken(config);
    return { ok: true, message: "Connected — Twitch app token acquired" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
