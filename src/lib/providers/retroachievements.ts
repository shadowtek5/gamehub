// RetroAchievements.org — real achievements for retro games.
// Games are matched by title within the right console; the match is cached
// on the rom row (ra_game_id: null = not checked yet, 0 = no match). Callers
// pass the *linked user's* own RA Web API credentials (see lib/userRa.ts) —
// there is no admin-global RA provider.

const API = "https://retroachievements.org/API";

/** RA Web API credentials — an RA username plus that account's Web API key. */
export interface RaCreds {
  username: string;
  apiKey: string;
}

/** GameHub platform slug -> RetroAchievements console id */
export const RA_CONSOLE_IDS: Record<string, number> = {
  genesis: 1, megadrive: 1,
  n64: 2, n64dd: 2,
  snes: 3, superfamicom: 3, satellaview: 3, sufami: 3,
  gb: 4,
  gba: 5,
  gbc: 6,
  nes: 7, famicom: 7, fds: 7,
  pce: 8, pcengine: 8,
  segacd: 9, megacd: 9,
  sega32x: 10,
  sms: 11, mark3: 11,
  psx: 12,
  lynx: 13,
  ngp: 14,
  gg: 15,
  gamecube: 16,
  jaguar: 17,
  nds: 18,
  ps2: 21,
  pokemini: 24,
  atari2600: 25,
  arcade: 27, neogeo: 27,
  vb: 28,
  msx: 29, msx2: 29,
  c64: 30,
  sg1000: 33,
  acpc: 37,
  appleii: 38,
  saturn: 39,
  dreamcast: 40,
  psp: 41,
  coleco: 44,
  intellivision: 45,
  vectrex: 46,
  pcfx: 49,
  atari7800: 51,
  wonderswan: 53,
  pcecd: 76, pcenginecd: 76,
  jaguarcd: 77,
  "3do": 43,
};

interface RaListGame {
  ID: number;
  Title: string;
  NumAchievements: number;
}

const listCache = (globalThis as unknown as {
  __raLists?: Map<number, { at: number; games: RaListGame[] }>;
});

function normalize(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

async function consoleGames(
  creds: RaCreds,
  consoleId: number
): Promise<RaListGame[]> {
  if (!listCache.__raLists) listCache.__raLists = new Map();
  const cached = listCache.__raLists.get(consoleId);
  if (cached && Date.now() - cached.at < 24 * 3600e3) return cached.games;

  const res = await fetch(
    `${API}/API_GetGameList.php?z=${encodeURIComponent(creds.username)}&y=${encodeURIComponent(creds.apiKey)}&i=${consoleId}&f=1`,
    { signal: AbortSignal.timeout(30_000) }
  );
  if (!res.ok) throw new Error(`RetroAchievements: HTTP ${res.status}`);
  const games = ((await res.json()) as RaListGame[]).filter((g) => g.NumAchievements > 0);
  listCache.__raLists.set(consoleId, { at: Date.now(), games });
  return games;
}

/** Find the RA game for a title on a platform. Returns id 0 when no match. */
export async function raLookup(
  creds: RaCreds,
  title: string,
  platformSlug: string
): Promise<{ id: number; achievements: number }> {
  const consoleId = RA_CONSOLE_IDS[platformSlug];
  if (!consoleId) return { id: 0, achievements: 0 };
  const games = await consoleGames(creds, consoleId);
  const want = normalize(title);
  if (!want) return { id: 0, achievements: 0 };

  let best: RaListGame | null = null;
  for (const g of games) {
    const got = normalize(g.Title);
    if (got === want) {
      best = g;
      break;
    }
    if (!best && (got.startsWith(want) || want.startsWith(got)) && Math.min(got.length, want.length) >= 6) {
      best = g;
    }
  }
  return best ? { id: best.ID, achievements: best.NumAchievements } : { id: 0, achievements: 0 };
}

export interface RaAchievement {
  title: string;
  description: string;
  badgeUrl: string;
  earned: boolean;
  points: number;
}

export interface RaProgress {
  gameId: number;
  total: number;
  earned: number;
  achievements: RaAchievement[];
}

/** Game achievements + this user's own unlock progress (target = creds.username) */
export async function raProgress(
  creds: RaCreds,
  gameId: number
): Promise<RaProgress | null> {
  const res = await fetch(
    `${API}/API_GetGameInfoAndUserProgress.php?z=${encodeURIComponent(creds.username)}&y=${encodeURIComponent(creds.apiKey)}&g=${gameId}&u=${encodeURIComponent(creds.username)}`,
    { signal: AbortSignal.timeout(15_000) }
  );
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.Achievements) return null;

  const achievements: RaAchievement[] = Object.values(
    data.Achievements as Record<
      string,
      { Title: string; Description: string; BadgeName: string; DateEarned?: string; Points?: number }
    >
  ).map((a) => ({
    title: a.Title,
    description: a.Description,
    badgeUrl: `https://media.retroachievements.org/Badge/${a.BadgeName}${a.DateEarned ? "" : "_lock"}.png`,
    earned: !!a.DateEarned,
    points: a.Points ?? 0,
  }));

  return {
    gameId,
    total: achievements.length,
    earned: achievements.filter((a) => a.earned).length,
    achievements,
  };
}
