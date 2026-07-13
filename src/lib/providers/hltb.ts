// HowLongToBeat completion times. There's no official API, and HLTB actively
// guards search: you first hit /api/bleed/init for a short-lived security token
// (+ a rotating honeypot field name/value), then POST the search to /api/bleed
// with those as headers AND a body field. Tokens expire (403) — we cache one
// briefly and refresh+retry once. Fails soft when they change things again.

const BASE = "https://howlongtobeat.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface HltbTimes {
  main: number | null; // seconds
  plus: number | null;
  completionist: number | null;
}

interface HltbSec {
  token: string;
  hpKey: string;
  hpVal: string;
  at: number;
}

const globalHltb = globalThis as unknown as { __hltbSec?: HltbSec | null };

const SEC_TTL_MS = 10 * 60_000;

const HEADERS = {
  "User-Agent": UA,
  Referer: `${BASE}/`,
  Origin: BASE,
};

/** Fetch (or reuse) the search security token + honeypot key/value. */
async function getSecurity(force = false): Promise<HltbSec | null> {
  const cached = globalHltb.__hltbSec;
  if (!force && cached && Date.now() - cached.at < SEC_TTL_MS) return cached;
  try {
    const res = await fetch(`${BASE}/api/bleed/init?t=${Date.now()}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as
      | { token?: string; hpKey?: string; hpVal?: string }
      | null;
    if (!j?.token) return null;
    const sec: HltbSec = {
      token: j.token,
      hpKey: j.hpKey ?? "",
      hpVal: j.hpVal ?? "",
      at: Date.now(),
    };
    globalHltb.__hltbSec = sec;
    return sec;
  } catch {
    globalHltb.__hltbSec = null;
    return null;
  }
}

function searchBody(terms: string[], sec: HltbSec): Record<string, unknown> {
  const body: Record<string, unknown> = {
    searchType: "games",
    searchTerms: terms,
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        userId: 0,
        platform: "",
        sortCategory: "popular",
        rangeCategory: "main",
        rangeTime: { min: null, max: null },
        gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
        rangeYear: { min: "", max: "" },
        modifier: "",
      },
      users: { sortCategory: "postcount" },
      lists: { sortCategory: "follows" },
      filter: "",
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };
  // Honeypot: HLTB expects a body field named by hpKey holding hpVal.
  if (sec.hpKey) body[sec.hpKey] = sec.hpVal;
  return body;
}

async function postSearch(terms: string[], sec: HltbSec): Promise<Response> {
  return fetch(`${BASE}/api/bleed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...HEADERS,
      "x-auth-token": sec.token,
      "x-hp-key": sec.hpKey,
      "x-hp-val": sec.hpVal,
    },
    body: JSON.stringify(searchBody(terms, sec)),
    signal: AbortSignal.timeout(15_000),
  });
}

export async function hltbLookup(title: string): Promise<HltbTimes | null> {
  let sec = await getSecurity();
  if (!sec) return null;
  try {
    const clean = title
      .replace(/\([^)]*\)/g, "")
      .replace(/[^\w\s':-]/g, " ")
      .trim();
    const terms = clean.split(/\s+/).filter(Boolean);
    if (!terms.length) return null;

    let res = await postSearch(terms, sec);
    // Expired/invalid token → refresh once and retry.
    if (res.status === 403) {
      sec = await getSecurity(true);
      if (!sec) return null;
      res = await postSearch(terms, sec);
    }
    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    const games = (data?.data ?? []) as Record<string, unknown>[];
    if (!games.length) return null;
    // Prefer an exact normalized title match, else the top (most popular) hit
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const target = norm(clean);
    const game =
      games.find((g) => norm(String(g.game_name ?? "")) === target) ?? games[0];
    const seconds = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    return {
      main: seconds(game.comp_main),
      plus: seconds(game.comp_plus),
      completionist: seconds(game.comp_100),
    };
  } catch {
    return null;
  }
}

export function formatHltb(seconds: number): string {
  const halfHours = Math.round(seconds / 1800);
  return `${halfHours % 2 === 0 ? halfHours / 2 : `${(halfHours / 2).toFixed(1)}`}h`;
}
