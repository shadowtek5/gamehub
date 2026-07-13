// Per-provider scrape quota tracking. The whole point: never blindly hammer a
// provider into its daily/thread ceiling and start failing mid-job.
//
// ScreenScraper is special — every API response carries an `ssuser` block with
// the account's LIVE counters (requeststoday / maxrequestsperday / maxthreads /
// requestskotoday). Those are authoritative, so we store them verbatim and let
// them drive both the concurrency ceiling and the "pause before we fail" gate.
// For the other providers we don't get counters back, so we track our own
// request/error tallies against the limits we know about (see PROVIDER_LIMITS)
// for visibility and soft pacing.
//
// State lives in the `settings` table as one JSON blob (key `scrape_quota`), so
// there's no schema migration — it survives restarts and shows up in backups.

import { getSetting, setSetting } from "../db";
import type { ProviderId } from "./config";

const SETTINGS_KEY = "scrape_quota";

/** Per-provider rate windows. ScreenScraper's real numbers come LIVE from the
 *  API (per account); the others' caps are the published references and are
 *  enforced authoritatively at runtime by the API's own 429 + Retry-After. */
export const PROVIDER_LIMITS: Partial<
  Record<ProviderId, { window: "day" | "hour" | "second"; perWindow?: number; note: string }>
> = {
  screenscraper: { window: "day", note: "Daily request + thread caps are set per account (reported live by the API)." },
  mobygames: { window: "hour", perWindow: 360, note: "Non-commercial keys allow ~360 requests/hour." },
  igdb: { window: "second", perWindow: 4, note: "Twitch rate limit of 4 requests/second (no daily cap)." },
  steamgriddb: { window: "day", note: "No published hard daily limit." },
};

/** Parse an HTTP `Retry-After` header (delta-seconds or HTTP-date) → seconds. */
export function retryAfterSeconds(header: string | null): number | null {
  if (!header) return null;
  const n = Number(header);
  if (Number.isFinite(n)) return Math.max(0, n);
  const t = Date.parse(header);
  return Number.isFinite(t) ? Math.max(0, Math.round((t - Date.now()) / 1000)) : null;
}

export interface ProviderQuota {
  provider: string;
  /** Local calendar day (server tz) these tallies belong to; rolls at midnight. */
  day: string;
  /** Requests we've issued today (our own count). */
  requests: number;
  /** Requests that failed today (our own count). */
  errors: number;
  // --- ScreenScraper authoritative counters (null for everyone else) ---
  /** requeststoday reported by ScreenScraper. */
  ssRequestsToday?: number | null;
  /** maxrequestsperday reported by ScreenScraper. */
  ssMaxRequestsPerDay?: number | null;
  /** requestskotoday (failed) reported by ScreenScraper. */
  ssKoToday?: number | null;
  /** maxrequestskoperday reported by ScreenScraper. */
  ssMaxKoPerDay?: number | null;
  /** maxthreads reported by ScreenScraper — the sanctioned concurrency. */
  ssMaxThreads?: number | null;
  // --- rolling hour window (hour-capped providers e.g. MobyGames) ---
  hourStart?: string | null;
  hourCount?: number;
  hourErrors?: number;
  /** API rate-limit cooldown from a 429 Retry-After — skip the provider until
   *  this passes (the API telling us we've hit its ceiling). */
  blockedUntil?: string | null;
  /** ISO timestamp of the last authoritative update. */
  updatedAt?: string | null;
}

type Store = Record<string, ProviderQuota>;

const g = globalThis as unknown as { __scrapeQuota?: Store };

function today(): string {
  // YYYY-MM-DD in the server's local time.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function load(): Store {
  if (g.__scrapeQuota) return g.__scrapeQuota;
  let store: Store = {};
  const raw = getSetting(SETTINGS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") store = parsed as Store;
    } catch {
      /* corrupt blob — start fresh */
    }
  }
  g.__scrapeQuota = store;
  return store;
}

function persist(store: Store) {
  try {
    setSetting(SETTINGS_KEY, JSON.stringify(store));
  } catch {
    // best-effort; the in-memory copy is still authoritative for this process
  }
}

/** The row for a provider, rolled over to today if the stored day is stale. */
function row(provider: string): ProviderQuota {
  const store = load();
  const t = today();
  let q = store[provider];
  if (!q || q.day !== t) {
    q = { provider, day: t, requests: 0, errors: 0 };
    // Carry ScreenScraper's live max* across the rollover so the ceiling is
    // known before the first request of the new day lands.
    const prev = store[provider];
    if (prev) {
      q.ssMaxRequestsPerDay = prev.ssMaxRequestsPerDay;
      q.ssMaxKoPerDay = prev.ssMaxKoPerDay;
      q.ssMaxThreads = prev.ssMaxThreads;
    }
    store[provider] = q;
  }
  return q;
}

/** Count one request we issued against a provider (ok=false marks a failure). */
export function recordRequest(provider: ProviderId | string, ok: boolean) {
  const store = load();
  const q = row(provider);
  q.requests += 1;
  if (!ok) q.errors += 1;
  // Roll an hour bucket for hour-capped providers (MobyGames).
  if (PROVIDER_LIMITS[provider as ProviderId]?.window === "hour") {
    const now = Date.now();
    const start = q.hourStart ? Date.parse(q.hourStart) : 0;
    if (!q.hourStart || now - start >= 3_600_000) {
      q.hourStart = new Date(now).toISOString();
      q.hourCount = 0;
      q.hourErrors = 0;
    }
    q.hourCount = (q.hourCount ?? 0) + 1;
    if (!ok) q.hourErrors = (q.hourErrors ?? 0) + 1;
  }
  q.updatedAt = new Date().toISOString();
  persist(store);
}

/** Record that a provider's API told us we're rate-limited (HTTP 429). We skip
 *  it until the cooldown (Retry-After, or a 60s default) elapses. */
export function recordRateLimit(provider: ProviderId | string, retryAfterSec: number | null) {
  const store = load();
  const q = row(provider);
  const sec = retryAfterSec && retryAfterSec > 0 ? retryAfterSec : 60;
  q.blockedUntil = new Date(Date.now() + sec * 1000).toISOString();
  q.updatedAt = new Date().toISOString();
  persist(store);
}

/** Fields we care about from a ScreenScraper `response.ssuser` block. Values
 *  arrive as strings, so everything is coerced defensively. */
export interface SsUser {
  maxthreads?: string | number;
  requeststoday?: string | number;
  maxrequestsperday?: string | number;
  requestskotoday?: string | number;
  maxrequestskoperday?: string | number;
}

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Store the authoritative counters ScreenScraper returns on every call. */
export function recordSsUser(user: SsUser | undefined | null) {
  if (!user) return;
  const store = load();
  const q = row("screenscraper");
  const maxThreads = num(user.maxthreads);
  const reqToday = num(user.requeststoday);
  const maxReq = num(user.maxrequestsperday);
  const koToday = num(user.requestskotoday);
  const maxKo = num(user.maxrequestskoperday);
  if (maxThreads !== null) q.ssMaxThreads = maxThreads;
  if (reqToday !== null) q.ssRequestsToday = reqToday;
  if (maxReq !== null) q.ssMaxRequestsPerDay = maxReq;
  if (koToday !== null) q.ssKoToday = koToday;
  if (maxKo !== null) q.ssMaxKoPerDay = maxKo;
  q.updatedAt = new Date().toISOString();
  persist(store);
}

export function getQuota(provider: ProviderId | string): ProviderQuota {
  return { ...row(provider) };
}

export function getAllQuotas(): ProviderQuota[] {
  const store = load();
  const t = today();
  // Touch every stored provider so callers always see today's numbers.
  for (const p of Object.keys(store)) row(p);
  return Object.values(store)
    .filter((q) => q.day === t)
    .map((q) => ({ ...q }));
}

// ---------- unified, per-window quota view (display + enforcement) ----------

const MARGIN = 5; // keep a few requests in reserve before we call it "blocked"

export interface QuotaInfo {
  provider: string;
  /** successful / failed / total requests used in the provider's window. */
  success: number;
  failed: number;
  used: number;
  /** the cap for this window, or null when the provider has no hard cap. */
  total: number | null;
  window: "day" | "hour" | "second" | null;
  /** over its cap or under a 429 cooldown — the scraper skips it while true. */
  blocked: boolean;
  /** when the window resets / the cooldown ends (ISO), for the UI. */
  resetsAt: string | null;
  /** true when `total` came LIVE from the provider's API (ScreenScraper). */
  live: boolean;
  note: string;
}

function endOfDayISO(): string {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
}

/** Unified quota snapshot for one provider, respecting its window. */
export function quotaInfo(provider: string): QuotaInfo {
  const q = row(provider);
  const lim = PROVIDER_LIMITS[provider as ProviderId];
  const cooling =
    q.blockedUntil && Date.parse(q.blockedUntil) > Date.now() ? q.blockedUntil : null;

  if (provider === "screenscraper") {
    const used = q.ssRequestsToday ?? q.requests;
    const failed = q.ssKoToday ?? q.errors;
    const total = q.ssMaxRequestsPerDay ?? null;
    const blocked = (total != null && used >= total - MARGIN) || !!cooling;
    return {
      provider, success: Math.max(0, used - failed), failed, used, total,
      window: "day", blocked, resetsAt: cooling ?? (total != null ? endOfDayISO() : null),
      live: total != null, note: lim?.note ?? "",
    };
  }

  if (lim?.window === "hour") {
    const now = Date.now();
    const start = q.hourStart ? Date.parse(q.hourStart) : 0;
    const fresh = !q.hourStart || now - start >= 3_600_000;
    const used = fresh ? 0 : q.hourCount ?? 0;
    const failed = fresh ? 0 : q.hourErrors ?? 0;
    const total = lim.perWindow ?? null;
    const blocked = (total != null && used >= total) || !!cooling;
    return {
      provider, success: Math.max(0, used - failed), failed, used, total,
      window: "hour", blocked,
      resetsAt: cooling ?? (!fresh ? new Date(start + 3_600_000).toISOString() : null),
      live: false, note: lim.note,
    };
  }

  // per-second (IGDB) or uncapped (SteamGridDB): show today's tallies; a hard
  // block only comes from the API's own 429 cooldown (pacing handles the rest).
  const used = q.requests;
  const failed = q.errors;
  return {
    provider, success: Math.max(0, used - failed), failed, used,
    total: null, window: lim?.window ?? null, blocked: !!cooling,
    resetsAt: cooling, live: false, note: lim?.note ?? "",
  };
}

/** True when the scraper should skip this provider right now. */
export function quotaBlocked(provider: string): boolean {
  return quotaInfo(provider).blocked;
}

/** The rate-limited online API providers whose request budgets the download
 *  metrics track. Deliberately excludes LaunchBox and libretro (local DB / CDN
 *  image pulls with no API quota) and EmuMovies (FTP) — those are primary data
 *  sources, not metered endpoints, so counting "requests" against them is
 *  meaningless and just clutters the strip. */
const METERED_PROVIDERS = ["screenscraper", "igdb", "mobygames", "steamgriddb"] as const;

/** Every metered online provider's quota (always shown, even at zero usage). */
export function getAllQuotaInfo(): QuotaInfo[] {
  return METERED_PROVIDERS.map((p) => quotaInfo(p));
}

/** ScreenScraper's sanctioned concurrency. Falls back to 1 when unknown, which
 *  is the safe assumption for an un-probed / anonymous account. */
export function getSsThreadLimit(): number {
  const q = row("screenscraper");
  const t = q.ssMaxThreads ?? 0;
  return t > 0 ? t : 1;
}

/** How close ScreenScraper is to a hard failure. `blocked` means the next
 *  request would very likely be rejected, so the bulk job should pause rather
 *  than burn requests into errors. A small margin keeps a few requests in
 *  reserve (single-game scrapes, retries) instead of hitting the wall exactly. */
export function ssQuotaStatus(): {
  blocked: boolean;
  reason: string | null;
  requestsToday: number | null;
  maxRequestsPerDay: number | null;
} {
  const q = row("screenscraper");
  const used = q.ssRequestsToday ?? null;
  const max = q.ssMaxRequestsPerDay ?? null;
  const koUsed = q.ssKoToday ?? null;
  const koMax = q.ssMaxKoPerDay ?? null;
  const MARGIN = 5; // keep a handful of requests in reserve

  if (max !== null && used !== null && used >= max - MARGIN) {
    return {
      blocked: true,
      reason: `ScreenScraper daily request limit reached (${used}/${max}). Resets tomorrow.`,
      requestsToday: used,
      maxRequestsPerDay: max,
    };
  }
  if (koMax !== null && koUsed !== null && koUsed >= koMax - MARGIN) {
    return {
      blocked: true,
      reason: `ScreenScraper daily failed-request limit reached (${koUsed}/${koMax}). Resets tomorrow.`,
      requestsToday: used,
      maxRequestsPerDay: max,
    };
  }
  return { blocked: false, reason: null, requestsToday: used, maxRequestsPerDay: max };
}
