// ScreenScraper.fr scraper — https://api.screenscraper.fr/api2/jeuInfos.php
// Requires developer credentials (request via screenscraper.fr forums) and,
// ideally, a user account (ssid/sspassword) for better rate limits.

import { RomRow } from "../db";
import { ScreenScraperConfig, MediaRefs } from "./config";
import { recordRequest, recordSsUser, type SsUser } from "./quota";
import { ssFetch } from "./ssFetch";

const API = "https://api.screenscraper.fr/api2";

// Node's fetch (undici) reports every network failure as the opaque
// "TypeError: fetch failed" and stashes the real reason on `.cause` (a DNS
// error, connection reset, IPv6 timeout, TLS problem, …). Dig it out so the
// connection test says *why* it failed instead of just "fetch failed".
function netErrorDetail(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const cause = (e as { cause?: unknown }).cause;
  const fromErr = (x: unknown): string | null => {
    if (!(x instanceof Error)) return null;
    const code = (x as { code?: string }).code;
    return code ? `${code} — ${x.message}` : x.message;
  };
  // happy-eyeballs failures arrive as an AggregateError with multiple attempts
  const errs = (cause as { errors?: unknown[] } | undefined)?.errors;
  if (Array.isArray(errs) && errs.length) {
    return errs.map((x) => fromErr(x) ?? String(x)).join("; ");
  }
  return fromErr(cause) ?? e.message;
}

// The ScreenScraper system-id preset lives in its own module so non-provider
// code (e.g. the systems-table seeder) can import it without a cycle.
import { SS_SYSTEM_IDS } from "./ssSystems";
export { SS_SYSTEM_IDS };

export interface ScrapedGame {
  title?: string;
  description?: string;
  developer?: string;
  publisher?: string;
  genre?: string;
  players?: string;
  rating?: string;
  releaseDate?: string;
  /** Comma-joined No-Intro-style codes ("En,Fr,De") from the matched ROM */
  language?: string;
  /** Region of the matched ROM ("us", "eu", "jp", …) */
  region?: string;
  /** Content classification, e.g. "ESRB: E" / "PEGI: 12" */
  ageRating?: string;
  boxartUrl?: string;
  screenshotUrl?: string;
  videoUrl?: string;
}

interface SsText {
  text?: string;
}
interface SsRegionalText {
  region?: string;
  langue?: string;
  text?: string;
}
interface SsMedia {
  type?: string;
  url?: string;
  region?: string;
  format?: string;
  parent?: string;
}
interface SsGenre {
  noms?: { langue?: string; text?: string }[];
}
interface SsClassification {
  type?: string;
  text?: string;
}
interface SsRom {
  romfilename?: string;
  romregions?: string;
  romlangues?: string;
}
interface SsJeu {
  noms?: SsRegionalText[];
  synopsis?: SsRegionalText[];
  editeur?: SsText;
  developpeur?: SsText;
  joueurs?: SsText;
  note?: SsText;
  dates?: SsRegionalText[];
  genres?: SsGenre[];
  classifications?: SsClassification[];
  medias?: SsMedia[];
  /** The single ROM that matched this lookup (has region/language) */
  rom?: SsRom;
}

/** SS ships lowercase 2-letter codes ("en"); the app uses "En" (No-Intro). */
function normLangs(csv: string | undefined): string | undefined {
  if (!csv) return undefined;
  const codes = csv
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => c.slice(0, 1).toUpperCase() + c.slice(1).toLowerCase());
  return codes.length ? [...new Set(codes)].join(",") : undefined;
}

/** Prefer ESRB, then PEGI, else the first classification, as "TYPE: value". */
function pickClassification(list: SsClassification[] | undefined): string | undefined {
  if (!list?.length) return undefined;
  const order = ["ESRB", "PEGI", "USK", "CERO", "ACB", "SELL"];
  const byType = (t: string) => list.find((c) => c.type?.toUpperCase() === t && c.text);
  const hit = order.map(byType).find(Boolean) ?? list.find((c) => c.text);
  return hit?.text ? `${hit.type ?? "Rating"}: ${hit.text}` : undefined;
}

const REGION_PREF = ["us", "wor", "eu", "jp", "ss"];

function pickRegional(list: SsRegionalText[] | undefined, key: "region" | "langue", prefs: string[]): string | undefined {
  if (!list?.length) return undefined;
  for (const pref of prefs) {
    const hit = list.find((x) => x[key]?.toLowerCase() === pref && x.text);
    if (hit) return hit.text;
  }
  return list.find((x) => x.text)?.text;
}

function pickMedia(medias: SsMedia[] | undefined, types: string[]): SsMedia | undefined {
  if (!medias?.length) return undefined;
  for (const type of types) {
    const candidates = medias.filter((m) => m.type === type && m.url);
    if (!candidates.length) continue;
    for (const pref of REGION_PREF) {
      const hit = candidates.find((m) => m.region?.toLowerCase() === pref);
      if (hit) return hit;
    }
    return candidates[0];
  }
  return undefined;
}

export type SsMediaRefs = MediaRefs;

// systemesListe.php lists every system with its media URLs already built (the
// right media names + params). We cache the FULL media list per system so the
// art pickers can offer every available piece, not just one hero/logo.
interface SsSystemArtUrls { hero?: string; logo?: string; icon?: string; ribbon?: string }
export interface SsSystemMedia { type: string; url: string }
/** Parsed system metadata (compagnie/type/dates/supporttype/names). */
export interface SsSystemMeta {
  manufacturer?: string;
  systemType?: string;
  yearStart?: string;
  yearEnd?: string;
  mediaFormat?: string;
  nameJp?: string;
  altNames?: string;
}
interface SysListCache { at: number; byId: Map<number, SsSystemMedia[]> }
const sysListGlobal = globalThis as unknown as { __ssSysListV4?: SysListCache };
// Metadata parsed from the same systemesListe fetch, cached alongside the media.
const sysMetaGlobal = globalThis as unknown as { __ssSysMetaV4?: Map<number, SsSystemMeta> };
const SYS_LIST_TTL = 6 * 60 * 60 * 1000; // 6h

// System-art type mapping (media names verified against systemesListe). First
// match wins:
//   hero   ← the wallpaper / background art (a plain console photo as a light
//            fallback so every system still gets a header background)
//   logo   ← the main full-colour "wheel" logo (mono as a fallback)
//   icon   ← the system illustration (square icon fields as a fallback)
//   ribbon ← screenmarquee (branded landscape marquee) — the fallback shown in
//            the diagonal ribbon collage when a system has no scraped covers
const HERO_TYPES = ["background", "photo"];
const LOGO_TYPES = ["wheel", "logo-monochrome"];
const ICON_TYPES = ["illustration", "icone", "icon"];
const RIBBON_TYPES = ["screenmarquee", "screenmarquee-vierge"];

async function ssSystemList(config: ScreenScraperConfig): Promise<Map<number, SsSystemMedia[]>> {
  const cached = sysListGlobal.__ssSysListV4;
  if (cached && Date.now() - cached.at < SYS_LIST_TTL) return cached.byId;

  const params = new URLSearchParams({
    devid: config.devid,
    devpassword: config.devpassword,
    softname: config.softname || "GameHub",
    output: "json",
  });
  if (config.ssid) params.set("ssid", config.ssid);
  if (config.sspassword) params.set("sspassword", config.sspassword);

  const byId = new Map<number, SsSystemMedia[]>();
  const metaById = new Map<number, SsSystemMeta>();
  try {
    const res = await ssFetch(`${API}/systemesListe.php?${params}`, { signal: AbortSignal.timeout(60_000) });
    if (res.ok) {
      const data = (await res.json()) as {
        response?: {
          ssuser?: SsUser;
          systemes?: {
            id: number;
            medias?: { type: string; url: string }[];
            noms?: { nom_jp?: string; noms_commun?: string };
            compagnie?: string;
            type?: string;
            datedebut?: string;
            datefin?: string;
            supporttype?: string;
          }[];
        };
      };
      recordSsUser(data.response?.ssuser);
      recordRequest("screenscraper", true);
      for (const sys of data.response?.systemes ?? []) {
        const id = Number(sys.id);
        const medias = (sys.medias ?? [])
          .filter((m) => m.type && m.url)
          .map((m) => ({ type: m.type, url: m.url }));
        byId.set(id, medias);
        metaById.set(id, {
          manufacturer: sys.compagnie || undefined,
          systemType: sys.type || undefined,
          yearStart: sys.datedebut || undefined,
          yearEnd: sys.datefin || undefined,
          mediaFormat: sys.supporttype || undefined,
          nameJp: sys.noms?.nom_jp || undefined,
          altNames: sys.noms?.noms_commun || undefined,
        });
      }
    }
  } catch {
    /* leave maps empty */
  }
  sysListGlobal.__ssSysListV4 = { at: Date.now(), byId };
  sysMetaGlobal.__ssSysMetaV4 = metaById;
  return byId;
}

function pickFirst(medias: SsSystemMedia[], types: string[]): string | undefined {
  for (const t of types) {
    const m = medias.find((x) => x.type === t);
    if (m) return m.url;
  }
  return undefined;
}

/** Ready-to-download hero/logo URLs for a platform's system art, or null.
 *  (Single best of each — used by the auto-fetch scraper.) */
export async function ssSystemArt(
  config: ScreenScraperConfig,
  platformSlug: string
): Promise<SsSystemArtUrls | null> {
  const systemId = SS_SYSTEM_IDS[platformSlug];
  if (!systemId) return null;
  const medias = (await ssSystemList(config)).get(systemId);
  if (!medias) return null;
  return {
    hero: pickFirst(medias, HERO_TYPES),
    logo: pickFirst(medias, LOGO_TYPES),
    icon: pickFirst(medias, ICON_TYPES),
    ribbon: pickFirst(medias, RIBBON_TYPES),
  };
}

/** Scraped metadata for a platform's system (manufacturer, type, years…), or null. */
export async function ssSystemInfo(
  config: ScreenScraperConfig,
  platformSlug: string
): Promise<SsSystemMeta | null> {
  const systemId = SS_SYSTEM_IDS[platformSlug];
  if (!systemId) return null;
  await ssSystemList(config); // ensures the metadata cache is populated
  return sysMetaGlobal.__ssSysMetaV4?.get(systemId) ?? null;
}

/**
 * Every system media of one kind, for the art pickers:
 *  - hero   → the wallpaper/background art, then every other still image
 *  - logo   → the wheel / monochrome logo fields
 *  - icon   → the illustration, then the square icon fields (icone/icon)
 *  - ribbon → the screenmarquee (branded landscape) fields
 */
export async function ssSystemMedia(
  config: ScreenScraperConfig,
  platformSlug: string,
  kind: "hero" | "logo" | "icon" | "ribbon"
): Promise<SsSystemMedia[]> {
  const systemId = SS_SYSTEM_IDS[platformSlug];
  if (!systemId) return [];
  const medias = (await ssSystemList(config)).get(systemId) ?? [];
  if (kind === "hero") {
    const order = (t: string) => {
      const i = HERO_TYPES.indexOf(t);
      return i === -1 ? HERO_TYPES.length : i;
    };
    // Wallpaper first, then every other still image so the picker still offers
    // the full set. Drop video (not artwork) and the vertical grids/logos that
    // don't work as a wide header.
    return medias
      .filter((m) => !/video/i.test(m.type))
      .sort((a, b) => order(a.type) - order(b.type));
  }
  if (kind === "logo") return medias.filter((m) => LOGO_TYPES.includes(m.type));
  if (kind === "ribbon")
    return medias.filter((m) => RIBBON_TYPES.includes(m.type) || /screenmarquee/i.test(m.type));
  return medias.filter((m) => ICON_TYPES.includes(m.type) || /icon/i.test(m.type));
}

export async function ssLookup(
  config: ScreenScraperConfig,
  rom: Pick<RomRow, "filename" | "size_bytes" | "platform_slug">,
  /** Force a specific ScreenScraper game (from ssSearch) instead of matching by file */
  gameId?: number,
  /** Prefer 3D box renders over flat 2D scans */
  boxStyle: "2d" | "3d" = "2d"
): Promise<{ game?: ScrapedGame; media?: SsMediaRefs; error?: string }> {
  const systemId = SS_SYSTEM_IDS[rom.platform_slug];
  if (!systemId && !gameId) {
    return { error: `No ScreenScraper system id for platform "${rom.platform_slug}"` };
  }

  const params = new URLSearchParams({
    devid: config.devid,
    devpassword: config.devpassword,
    softname: config.softname || "GameHub",
    output: "json",
  });
  if (gameId) {
    params.set("gameid", String(gameId));
  } else {
    params.set("systemeid", String(systemId));
    params.set("romtype", "rom");
    params.set("romnom", rom.filename);
    params.set("romtaille", String(rom.size_bytes));
  }
  if (config.ssid) params.set("ssid", config.ssid);
  if (config.sspassword) params.set("sspassword", config.sspassword);

  let res: Response;
  try {
    res = await ssFetch(`${API}/jeuInfos.php?${params}`, {
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    return { error: `ScreenScraper unreachable: ${netErrorDetail(e)}` };
  }

  const body = await res.text();
  if (!res.ok || !body.trim().startsWith("{")) {
    // API returns plain-text errors (bad credentials, quota, not found) — no
    // ssuser block to read, so fall back to our own failed-request tally.
    recordRequest("screenscraper", false);
    const msg = body.trim().slice(0, 200) || `HTTP ${res.status}`;
    if (/introuvable|not found/i.test(msg)) return { error: "Game not found on ScreenScraper" };
    return { error: `ScreenScraper: ${msg}` };
  }

  let parsed: { response?: { jeu?: SsJeu; ssuser?: SsUser } } | undefined;
  try {
    parsed = JSON.parse(body);
  } catch {
    recordRequest("screenscraper", false);
    return { error: "ScreenScraper returned invalid JSON" };
  }
  // Every JSON response carries the account's live quota counters — store them.
  recordSsUser(parsed?.response?.ssuser);
  recordRequest("screenscraper", true);
  const jeu = parsed?.response?.jeu;
  if (!jeu) return { error: "Game not found on ScreenScraper" };

  const game: ScrapedGame = {
    title: pickRegional(jeu.noms, "region", REGION_PREF),
    description: pickRegional(jeu.synopsis, "langue", ["en", "fr"]),
    developer: jeu.developpeur?.text || undefined,
    publisher: jeu.editeur?.text || undefined,
    players: jeu.joueurs?.text || undefined,
    rating: jeu.note?.text ? `${jeu.note.text}/20` : undefined,
    releaseDate: pickRegional(jeu.dates, "region", REGION_PREF),
    genre:
      jeu.genres
        ?.map((g) => g.noms?.find((n) => n.langue === "en")?.text ?? g.noms?.[0]?.text)
        .filter(Boolean)
        .join(", ") || undefined,
    language: normLangs(jeu.rom?.romlangues),
    region: jeu.rom?.romregions?.trim() || undefined,
    ageRating: pickClassification(jeu.classifications),
  };

  const box = pickMedia(
    jeu.medias,
    boxStyle === "3d" ? ["box-3D", "box-2D"] : ["box-2D", "box-3D"]
  );
  const shot = pickMedia(jeu.medias, ["ss", "sstitle"]);
  // screenmarquee (in-game shot with the marquee/logo composited on top) is a
  // ready-made landscape hero — prefer it, then fall back to fanart / a plain
  // screenshot so every title still gets a hero.
  const hero = pickMedia(jeu.medias, ["screenmarquee", "fanart", "screenmarqueesmall", "ss"]);
  const video = pickMedia(jeu.medias, ["video-normalized", "video"]);
  const manual = pickMedia(jeu.medias, ["manuel"]);
  // Clear-logo / marquee art (transparent game title) — the "wheel" family
  const logo = pickMedia(jeu.medias, [
    "wheel-hd",
    "wheel",
    "wheel-carbon",
    "wheel-steel",
    "screenmarqueesmall",
    "screenmarquee",
  ]);

  const media: SsMediaRefs = {};
  if (box?.url) media.boxart = { url: box.url, format: box.format || "png" };
  if (shot?.url) media.screenshot = { url: shot.url, format: shot.format || "png" };
  if (hero?.url) media.hero = { url: hero.url, format: hero.format || "png" };
  if (video?.url) media.video = { url: video.url, format: video.format || "mp4" };
  if (manual?.url) media.manual = { url: manual.url, format: manual.format || "pdf" };
  if (logo?.url) media.logo = { url: logo.url, format: logo.format || "png" };

  return { game, media };
}

export interface SsSearchHit {
  id: number;
  title: string;
  system?: string;
  year?: string;
}

/** Search games by name (jeuRecherche) — for fixing an undetermined match */
export async function ssSearch(
  config: ScreenScraperConfig,
  query: string,
  platformSlug?: string
): Promise<{ hits: SsSearchHit[]; error?: string }> {
  const params = new URLSearchParams({
    devid: config.devid,
    devpassword: config.devpassword,
    softname: config.softname || "GameHub",
    output: "json",
    recherche: query,
  });
  const systemId = platformSlug ? SS_SYSTEM_IDS[platformSlug] : undefined;
  if (systemId) params.set("systemeid", String(systemId));
  if (config.ssid) params.set("ssid", config.ssid);
  if (config.sspassword) params.set("sspassword", config.sspassword);

  let res: Response;
  try {
    res = await ssFetch(`${API}/jeuRecherche.php?${params}`, {
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    return { hits: [], error: `ScreenScraper unreachable: ${netErrorDetail(e)}` };
  }
  const body = await res.text();
  if (!res.ok || !body.trim().startsWith("{")) {
    recordRequest("screenscraper", false);
    const msg = body.trim().slice(0, 200) || `HTTP ${res.status}`;
    if (/introuvable|not found/i.test(msg)) return { hits: [] };
    return { hits: [], error: `ScreenScraper: ${msg}` };
  }
  let jeux: (SsJeu & { id?: string; systeme?: { text?: string } })[];
  try {
    const root = JSON.parse(body) as {
      response?: { ssuser?: SsUser; jeux?: unknown };
    };
    recordSsUser(root?.response?.ssuser);
    recordRequest("screenscraper", true);
    jeux = Array.isArray(root?.response?.jeux)
      ? (root!.response!.jeux as typeof jeux)
      : [];
  } catch {
    recordRequest("screenscraper", false);
    return { hits: [], error: "ScreenScraper returned invalid JSON" };
  }
  const hits: SsSearchHit[] = [];
  for (const jeu of jeux) {
    const id = Number(jeu.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    hits.push({
      id,
      title: pickRegional(jeu.noms, "region", REGION_PREF) ?? `Game #${id}`,
      system: jeu.systeme?.text,
      year: pickRegional(jeu.dates, "region", REGION_PREF)?.slice(0, 4),
    });
  }
  return { hits: hits.slice(0, 20) };
}

/** Validate credentials via ssuserInfos (falls back to a plain infra ping) */
export async function ssTest(config: ScreenScraperConfig): Promise<{ ok: boolean; message: string }> {
  const params = new URLSearchParams({
    devid: config.devid,
    devpassword: config.devpassword,
    softname: config.softname || "GameHub",
    output: "json",
  });
  if (config.ssid) params.set("ssid", config.ssid);
  if (config.sspassword) params.set("sspassword", config.sspassword);
  try {
    const res = await ssFetch(`${API}/ssuserInfos.php?${params}`, {
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text();
    if (body.trim().startsWith("{")) {
      const user = JSON.parse(body)?.response?.ssuser;
      recordSsUser(user);
      return {
        ok: true,
        message: user?.id
          ? `Connected as ${user.id} (${user.maxthreads ?? 1} thread${(user.maxthreads ?? 1) > 1 ? "s" : ""}, ${user.maxrequestsperday ?? "?"} requests/day)`
          : "Developer credentials accepted",
      };
    }
    return { ok: false, message: body.trim().slice(0, 200) || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: `Unreachable: ${netErrorDetail(e)}` };
  }
}

/**
 * Fetch the account's live quota (ssuserInfos) and store it, so the bulk job
 * can size its worker pool to the sanctioned `maxthreads` and know the daily
 * ceiling before it issues the first jeuInfos call. Best-effort: on any failure
 * the caller falls back to the conservative default (1 thread).
 */
export async function ssProbeUser(config: ScreenScraperConfig): Promise<void> {
  const params = new URLSearchParams({
    devid: config.devid,
    devpassword: config.devpassword,
    softname: config.softname || "GameHub",
    output: "json",
  });
  if (config.ssid) params.set("ssid", config.ssid);
  if (config.sspassword) params.set("sspassword", config.sspassword);
  try {
    const res = await ssFetch(`${API}/ssuserInfos.php?${params}`, {
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text();
    if (body.trim().startsWith("{")) {
      recordSsUser(JSON.parse(body)?.response?.ssuser);
    }
  } catch {
    /* leave the last-known quota in place */
  }
}
