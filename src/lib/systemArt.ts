import sharp from "sharp";
import {
  getProviderConfig,
  getScraperOptions,
  screenscraperConfigured,
  steamgriddbConfigured,
} from "./providers/config";
import type { ApiKeyConfig } from "./providers/config";
import { ssSystemArt, ssSystemMedia } from "./providers/screenscraper";
import { ssFetch } from "./providers/ssFetch";
import { sgdbSearchGames, sgdbAssetList } from "./providers/steamgriddb";
import { lbPlatformArtCandidates } from "./providers/launchbox";
import { platformBySlug } from "./platforms";
import { defaultLogoUrl } from "./data/systemDefaultLogos";
import {
  getAllSystems,
  getSystem,
  getSystemShow,
  setSystemShow,
  setSystemHeroSource,
  setSystemLogoDark,
} from "./db";
import fs from "fs";
import {
  ART_KINDS,
  SystemArtKind,
  artFilePath,
  artUrl,
  clearArtFile,
  writeArtFile,
} from "./systemStore";

export type { SystemArtKind };

async function download(url: string): Promise<{ buf: Buffer; ext: string } | null> {
  try {
    const res = await ssFetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    const ext = ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg";
    return { buf, ext };
  } catch {
    return null;
  }
}

/**
 * Whether a logo is a dark wordmark — the average luminance of its opaque pixels
 * is low. A dark logo needs a light backdrop in the header instead of the usual
 * dark scrim. Best-effort; treats undecodable images as not-dark.
 */
async function isLogoDark(buf: Buffer): Promise<boolean> {
  try {
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    let sum = 0;
    let count = 0;
    for (let i = 0; i + ch <= data.length; i += ch) {
      const a = ch >= 4 ? data[i + 3] : 255;
      if (a < 40) continue; // ignore (near-)transparent pixels
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      count++;
    }
    if (count === 0) return false;
    // 0–255. Only clearly-dark wordmarks flip to the light backdrop; logos with
    // their own contrast (e.g. gold-on-black plates ~100) keep the dark scrim.
    return sum / count < 90;
  } catch {
    return false;
  }
}

// System-level art (per platform): the hero banner, wheel logo and square icon
// used to build the system header. The selected files and the per-piece "show"
// flags live under data/systems/<slug>/ (see systemStore). A piece whose show
// flag is false is turned OFF: it never displays or re-fetches.

export interface SystemArt {
  hero: string | null;
  logo: string | null;
  icon: string | null;
  /** screenmarquee — the branded landscape fallback for the ribbon collage */
  ribbon: string | null;
  /** which source backs the hero: the generated cover collage, or a scraped image */
  heroSource: "ribbon" | "image";
  /** the logo is a dark wordmark — the header gives it a light backdrop */
  logoDark: boolean;
}

/** The stored system art for a platform. A hidden piece (show=false) reads as
 *  null even when a file exists on disk. */
export function getSystemArt(slug: string): SystemArt {
  const row = getSystem(slug);
  if (!row)
    return { hero: null, logo: null, icon: null, ribbon: null, heroSource: "ribbon", logoDark: false };
  const shown: Record<SystemArtKind, number> = {
    hero: row.show_hero,
    logo: row.show_logo,
    icon: row.show_icon,
    ribbon: row.show_ribbon,
  };
  const read = (k: SystemArtKind) => (shown[k] ? artUrl(row.id, k) : null);
  // Delivered default: when a system has no scraped logo (but isn't suppressed),
  // fall back to the bundled full-color logo shipped in public/system-defaults.
  const scrapedLogo = read("logo");
  const logo = scrapedLogo ?? (row.show_logo ? defaultLogoUrl(slug) : null);
  return {
    hero: read("hero"),
    logo,
    icon: read("icon"),
    ribbon: read("ribbon"),
    // default logos are full-color, never dark wordmarks -> no light-backdrop treatment
    logoDark: scrapedLogo ? !!row.logo_dark : false,
    heroSource: row.hero_source === "image" ? "image" : "ribbon",
  };
}

/** slug → square icon URL for every system that has one shown. Used by the
 *  mixed-system library grid to badge each card with its console icon. */
export function getSystemIconMap(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const row of getAllSystems()) {
    out[row.slug] = row.show_icon ? artUrl(row.id, "icon") : null;
  }
  return out;
}

/** slug → { scraped icon URL, system name } from the DB (scraping fills these).
 *  Lets client surfaces show the scraped icon/name with a built-in fallback. */
export function getSystemDisplayMap(): Record<string, { icon: string | null; name: string }> {
  const out: Record<string, { icon: string | null; name: string }> = {};
  for (const row of getAllSystems()) {
    out[row.slug] = { icon: row.show_icon ? artUrl(row.id, "icon") : null, name: row.name };
  }
  return out;
}

/** Choose the generated cover collage as this system's hero (leaves any stored
 *  hero image in place as a no-covers fallback). */
export function useGeneratedRibbonHero(slug: string) {
  setSystemHeroSource(slug, "ribbon");
}

/** One-time pass: classify every already-stored logo as dark/light from its
 *  file on disk (no network). Lets existing installs pick up the adaptive
 *  backdrop without re-scraping. Returns how many logos were analyzed. */
export async function backfillLogoDark(): Promise<number> {
  let n = 0;
  for (const row of getAllSystems()) {
    const f = artFilePath(row.id, "logo");
    if (!f) continue;
    try {
      const buf = await fs.promises.readFile(f);
      setSystemLogoDark(row.slug, await isLogoDark(buf));
      n++;
    } catch {}
  }
  return n;
}

/** Distinct search terms for a console on name-based providers (SteamGridDB). */
function systemSearchTerms(slug: string): string[] {
  const p = platformBySlug(slug);
  return [...new Set([p?.name, p?.shortName, slug].filter(Boolean) as string[])];
}

/**
 * Aggregate art of one kind from SteamGridDB across every matching game entry
 * for a console's names — a console often has several pages (e.g. NES / Famicom),
 * so this surfaces far more choices than a single first-match lookup.
 */
async function sgdbSystemAssets(
  config: ApiKeyConfig,
  names: string[],
  kind: "hero" | "logo" | "icon",
  perGame = 12,
  maxGames = 6
): Promise<{ urls: string[]; error?: string }> {
  const ids = new Set<number>();
  let error: string | undefined;
  for (const name of names) {
    if (ids.size >= maxGames) break;
    const { games, error: e } = await sgdbSearchGames(config, name, 5);
    if (e) error = e;
    for (const g of games) {
      if (ids.size >= maxGames) break;
      ids.add(g.id);
    }
  }
  const urls: string[] = [];
  for (const id of ids) {
    urls.push(...(await sgdbAssetList(config, id, kind, perGame)));
  }
  const deduped = [...new Set(urls)];
  return { urls: deduped, error: deduped.length ? undefined : error };
}

/**
 * Pull system art from any configured provider that exposes systems media and
 * store it under data/systems/<id>/. Best-effort; returns which pieces were
 * fetched. `force` re-fetches even if art already exists. Hidden pieces
 * (show=false) are always skipped. Console metadata is scraped separately
 * (see scrapeSystemMeta / the "Scrape system info" actions).
 */
export async function scrapeSystemArt(
  slug: string,
  force = false
): Promise<{ got: string[] }> {
  const row = getSystem(slug);
  if (!row) return { got: [] };
  const id = row.id;
  const existing = getSystemArt(slug);
  const show = getSystemShow(slug);
  const need: Record<SystemArtKind, boolean> = {
    hero: (force || !existing.hero) && show.hero,
    logo: (force || !existing.logo) && show.logo,
    icon: (force || !existing.icon) && show.icon,
    ribbon: (force || !existing.ribbon) && show.ribbon,
  };

  const config = getProviderConfig();
  const got: string[] = [];

  async function save(kind: SystemArtKind, res: { buf: Buffer; ext: string } | null) {
    if (!res) return false;
    await writeArtFile(id, kind, res.buf, res.ext);
    if (kind === "logo") setSystemLogoDark(slug, await isLogoDark(res.buf));
    got.push(kind);
    return true;
  }

  const stillNeed = (k: SystemArtKind) => need[k] && !got.includes(k);

  // Fetch in the user's configured provider-priority order, each provider
  // filling only the pieces still missing. ScreenScraper, SteamGridDB and the
  // imported LaunchBox DB expose system/platform art; libretro/mobygames/igdb/
  // emumovies are per-game here, so they carry no system artwork and are
  // transparently skipped. The order among the art-capable providers is honored.
  if (ART_KINDS.some((k) => need[k])) {
    for (const provider of getScraperOptions().priority) {
      if (!ART_KINDS.some(stillNeed)) break;

      // ScreenScraper systems media: hero ← wallpaper, logo ← wheel,
      // icon ← illustration, ribbon ← screenmarquee.
      if (provider === "screenscraper" && screenscraperConfigured(config)) {
        const urls = await ssSystemArt(config.screenscraper, slug);
        if (urls) {
          if (stillNeed("hero") && urls.hero) await save("hero", await download(urls.hero));
          if (stillNeed("logo") && urls.logo) await save("logo", await download(urls.logo));
          if (stillNeed("icon") && urls.icon) await save("icon", await download(urls.icon));
          if (stillNeed("ribbon") && urls.ribbon) await save("ribbon", await download(urls.ribbon));
        }
      }

      // SteamGridDB — it carries hardware/platform entries too, so search the
      // console's names for anything earlier providers couldn't supply. SGDB has
      // no marquee, so a wide hero grid stands in for the ribbon fallback.
      else if (provider === "steamgriddb" && steamgriddbConfigured(config)) {
        const names = systemSearchTerms(slug);
        const sgdbKind: Record<SystemArtKind, "hero" | "logo" | "icon"> = {
          hero: "hero",
          logo: "logo",
          icon: "icon",
          ribbon: "hero",
        };
        for (const kind of ART_KINDS) {
          if (!stillNeed(kind)) continue;
          const { urls } = await sgdbSystemAssets(config.steamgriddb, names, sgdbKind[kind], 3, 3);
          if (urls[0]) await save(kind, await download(urls[0]));
        }
      }

      // LaunchBox platform art from the imported metadata DB (a local lookup).
      else if (provider === "launchbox") {
        for (const kind of ART_KINDS) {
          if (!stillNeed(kind)) continue;
          const imgs = lbPlatformArtCandidates(slug, kind);
          if (imgs[0]) await save(kind, await download(imgs[0].url));
        }
      }
    }
  }

  return { got };
}

export interface SystemArtCandidate {
  url: string;
  provider: string;
}

/**
 * Hero / logo / icon candidates for the system art pickers, pulled live from
 * every configured provider and aggregated across all matching entries so the
 * admin sees the full set of choices. Best-effort — provider errors are
 * collected rather than thrown so a partial list still renders.
 */
export async function systemArtCandidates(
  slug: string,
  kind: SystemArtKind
): Promise<{ candidates: SystemArtCandidate[]; errors: string[] }> {
  const config = getProviderConfig();
  const candidates: SystemArtCandidate[] = [];
  const errors: string[] = [];

  const tasks: Promise<void>[] = [];
  // ScreenScraper systems media: hero → every available piece of artwork, logo
  // → the wheel/monochrome fields, icon → the icone/icon fields.
  if (screenscraperConfigured(config)) {
    tasks.push(
      ssSystemMedia(config.screenscraper, slug, kind)
        .then((medias) => {
          for (const m of medias) candidates.push({ url: m.url, provider: `ScreenScraper (${m.type})` });
        })
        .catch((e) => {
          errors.push(`ScreenScraper: ${e instanceof Error ? e.message : e}`);
        })
    );
  }
  // SteamGridDB — aggregated across every matching game entry for the console.
  // SGDB has no marquee, so ribbon candidates come from its wide hero grids.
  if (steamgriddbConfigured(config)) {
    const sgdbKind = kind === "ribbon" ? "hero" : kind;
    tasks.push(
      sgdbSystemAssets(config.steamgriddb, systemSearchTerms(slug), sgdbKind, 12, 6).then(
        ({ urls, error }) => {
          if (error) errors.push(error);
          for (const url of urls) candidates.push({ url, provider: "SteamGridDB" });
        }
      )
    );
  }
  await Promise.allSettled(tasks);

  // LaunchBox platform art from the imported metadata DB (a local lookup).
  for (const m of lbPlatformArtCandidates(slug, kind)) {
    candidates.push({ url: m.url, provider: `LaunchBox (${m.type})` });
  }

  // De-dupe by URL, preserving provider order (SS first, then SGDB). The cap is
  // generous so a system with lots of ScreenScraper media doesn't crowd out the
  // SteamGridDB choices — the picker lazy-loads thumbnails.
  const seen = new Set<string>();
  const deduped = candidates.filter((c) => !seen.has(c.url) && seen.add(c.url));
  return { candidates: deduped.slice(0, 150), errors };
}

/**
 * Set (download), clear, or hide a system's hero/logo/icon.
 *  - `url` string → download and use it (turns the piece back ON)
 *  - `url: null`  → remove the stored file, reverting to the auto/default look
 *  - `suppress: true` → turn the piece OFF (show=false) so it never displays or
 *    re-fetches (e.g. "no logo"), keeping any downloaded file in place
 */
export async function setSystemArt(
  slug: string,
  kind: SystemArtKind,
  url: string | null,
  suppress = false
): Promise<{ ok: boolean; error?: string }> {
  const row = getSystem(slug);
  if (!row) return { ok: false, error: "Unknown system" };
  const id = row.id;

  if (suppress) {
    setSystemShow(slug, kind, false);
    return { ok: true };
  }

  // Any real change turns the piece back on.
  setSystemShow(slug, kind, true);

  if (url === null) {
    clearArtFile(id, kind);
    // Removing the hero image reverts to the generated cover collage.
    if (kind === "hero") setSystemHeroSource(slug, "ribbon");
    // No logo anymore → clear the dark-logo flag.
    if (kind === "logo") setSystemLogoDark(slug, false);
    return { ok: true };
  }
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: "Only http(s) image URLs are supported" };
  }
  const res = await download(url);
  if (!res) return { ok: false, error: "Download failed" };
  await writeArtFile(id, kind, res.buf, res.ext);
  // Choosing a hero image makes it the hero, overriding the generated collage.
  if (kind === "hero") setSystemHeroSource(slug, "image");
  // Record whether the chosen logo is a dark wordmark (drives the backdrop).
  if (kind === "logo") setSystemLogoDark(slug, await isLogoDark(res.buf));
  return { ok: true };
}

