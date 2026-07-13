import path from "path";
import { getDb, RomRow } from "../db";
import { platformBySlug } from "../platforms";
import {
  getProviderConfig,
  getScraperOptions,
  screenscraperConfigured,
  emumoviesConfigured,
  igdbConfigured,
  mobygamesConfigured,
  steamgriddbConfigured,
  thegamesdbConfigured,
  ProviderId,
  MediaKey,
} from "./config";
import { ssLookup, SsMediaRefs, ScrapedGame } from "./screenscraper";
import { emSharedClient, emLocate, emDownload, EmMediaResult } from "./emumovies";
import { igdbLookup, IgdbResult } from "./igdb";
import { mobyLookup, MobyResult } from "./mobygames";
import { tgdbLookup, TgdbResult } from "./thegamesdb";
import { sgdbLookup, SgdbResult } from "./steamgriddb";
import { launchboxConfigured, lbLookup, lbLookupById, LbResult } from "./launchbox";
import { hasheousLookup } from "./hasheous";
import { flashpointLookup, FlashpointResult } from "./flashpoint";
import { libretroCandidates } from "./libretro";
import { fetchBuf, saveMedia } from "./mediaSave";
import { datLookupByHash, datLookupByName } from "./datdb";
import { ratingLevel } from "../ageRating";
import { recordRequest, quotaBlocked } from "./quota";
import type { Client } from "basic-ftp";

export interface ScrapeOutcome {
  romId: number;
  title: string;
  ok: boolean;
  sources: string[];
  got: string[];
  error?: string;
}

/** Live sub-progress for one ROM, surfaced to the downloads page per game. */
export interface ScrapeProgress {
  phase: "matching" | "metadata" | "media";
  mediaDone: number;
  mediaTotal: number;
  /** Human-readable current sub-operation, e.g. "ScreenScraper — box art" or
   *  "Converting logo → WebP". Shown on the downloads-page secondary bar. */
  detail?: string;
}

// A "no match" (not found / unsupported platform) is a SUCCESSFUL request that
// simply returned nothing — it must not count as a provider failure in the quota
// (otherwise every game a provider doesn't carry inflates the "failed" tally).
function reqOk(error?: string): boolean {
  return !error || /not found|unsupported|no artwork|no metadata|no match/i.test(error);
}

/** Display names for the progress detail line. */
const PROVIDER_LABEL: Record<string, string> = {
  screenscraper: "ScreenScraper",
  emumovies: "EmuMovies",
  igdb: "IGDB",
  mobygames: "MobyGames",
  thegamesdb: "TheGamesDB",
  steamgriddb: "SteamGridDB",
  launchbox: "LaunchBox",
  libretro: "libretro-thumbnails",
  flashpoint: "Flashpoint",
};

interface MetaFields {
  description?: string;
  developer?: string;
  publisher?: string;
  genre?: string;
  players?: string;
  rating?: string;
  releaseDate?: string;
  language?: string;
  region?: string;
  ageRating?: string;
  franchise?: string;
  gameModes?: string;
  perspectives?: string;
  themes?: string;
  trailer?: string;
}

interface HttpRef {
  url: string;
  format: string;
}

function mediaDir(romId: number): string {
  return path.join(process.cwd(), "data", "media", String(romId));
}

function mediaUrl(romId: number, file: string): string {
  // Version stamp busts the browser cache when a re-scrape/re-pick reuses
  // the same filename (the media route ignores the query string)
  return `/api/media/${romId}/${file}?v=${Date.now()}`;
}

/**
 * Scrape one ROM. Providers are consulted in the configured priority order;
 * unconfigured sources are skipped. Metadata fields are merged down the
 * priority list (higher-priority values win, lower priority fills gaps).
 * Each enabled media item is taken from the first provider that has it.
 * `itemOverrides` replaces the global item toggles for this run — e.g.
 * fetching a video for one game while videos are globally disabled.
 */
export async function scrapeRom(
  romId: number,
  itemOverrides?: Partial<import("./config").ScraperItems>,
  /** Force a provider match (user-picked via "Fix metadata match") */
  matchOverride?: { ssGameId?: number; igdbGameId?: number; lbGameId?: number },
  /** Live per-ROM progress (phase + media items done) for the downloads view */
  onProgress?: (p: ScrapeProgress) => void,
  /** Backfill mode: only write metadata fields that are currently empty — never
   *  overwrite existing values (used by the "metadata only" scrape). */
  fillMissingOnly = false
): Promise<ScrapeOutcome> {
  const db = getDb();
  const rom = db.prepare("SELECT * FROM roms WHERE id = ?").get(romId) as RomRow | undefined;
  if (!rom) return { romId, title: "?", ok: false, sources: [], got: [], error: "ROM not found" };

  const platform = platformBySlug(rom.platform_slug);
  if (!platform) {
    return { romId, title: rom.title, ok: false, sources: [], got: [], error: "Unknown platform" };
  }

  const config = getProviderConfig();
  const options = getScraperOptions();
  const items = { ...options.items, ...itemOverrides };
  if (!Object.values(items).some(Boolean)) {
    return {
      romId,
      title: rom.title,
      ok: false,
      sources: [],
      got: [],
      error: "All scrape items are disabled in Settings → Scraping",
    };
  }

  const configured: Record<ProviderId, boolean> = {
    screenscraper: screenscraperConfigured(config),
    emumovies: emumoviesConfigured(config),
    igdb: igdbConfigured(config),
    mobygames: mobygamesConfigured(config),
    thegamesdb: thegamesdbConfigured(config),
    steamgriddb: steamgriddbConfigured(config),
    launchbox: launchboxConfigured(),
    libretro: true,
  };

  const sources = new Set<string>();
  const got: string[] = [];
  const errors: string[] = [];
  const updates: Record<string, string> = {};
  const dir = mediaDir(rom.id);

  // Shared live progress: `emit(detail)` reports the current phase + media count
  // plus a human-readable sub-operation for the downloads-page secondary bar.
  let mediaDone = 0;
  let mediaTotal = 0;
  let curPhase: ScrapeProgress["phase"] = "matching";
  const emit = (detail?: string) => onProgress?.({ phase: curPhase, mediaDone, mediaTotal, detail });
  const label = (p: string) => PROVIDER_LABEL[p] ?? p;
  emit("Identifying game");

  // Providers are consulted strictly in the user's configured Settings order —
  // no hidden reordering. Each metadata field / media item is taken from the
  // first provider in this list that has it, so lower-priority "generator"
  // sources (libretro, SteamGridDB) act as last-resort fallbacks simply by
  // sitting later in the order.
  const priority = options.priority;

  // DAT-assisted identification: prefer the canonical No-Intro/Redump name
  // (exact via hash when the ROM is hashed, else by title within the system) for
  // the LaunchBox lookup, so renamed or oddly-titled dumps still resolve.
  let identity: string | undefined;
  function identityName(): string {
    if (identity === undefined) {
      const dat =
        datLookupByHash({ crc32: rom!.crc32, md5: rom!.md5, sha1: rom!.sha1 }) ??
        datLookupByName(platform!.slug, rom!.title);
      identity = dat?.name ?? rom!.title;
    }
    return identity;
  }

  // Hash matching: when the file's hashes are known, Hasheous can identify
  // the exact game (as an IGDB id) — beats filename matching every time
  if (
    !matchOverride &&
    options.hashMatching &&
    configured.igdb &&
    (rom.md5 || rom.sha1 || rom.crc32)
  ) {
    const h = await hasheousLookup({ md5: rom.md5, sha1: rom.sha1, crc32: rom.crc32 });
    if (h.error) errors.push(h.error);
    if (h.igdbId) matchOverride = { igdbGameId: h.igdbId };
  }

  // ---- Lazy per-provider lookups (each provider is hit at most once) ----
  // Promise-memoized (not value-memoized) so the parallel media stage below
  // can call a getter from several tasks at once without racing into duplicate
  // network lookups — the first call starts the request, the rest await it.
  let ssP: Promise<{ game?: ScrapedGame; media?: SsMediaRefs } | null> | undefined;
  function getSs() {
    if (!ssP)
      ssP = (async () => {
        const { game, media, error } = await ssLookup(
          config.screenscraper,
          rom!,
          matchOverride?.ssGameId,
          options.boxStyle
        );
        if (error) errors.push(error);
        // ScreenScraper's own request/quota tallies are recorded inside ssLookup
        // (it reads the authoritative ssuser block), so don't double-count here.
        return game ? { game, media } : null;
      })();
    return ssP;
  }

  let igdbP: Promise<IgdbResult | null> | undefined;
  function getIgdb() {
    if (!igdbP)
      igdbP = (async () => {
        const { result, error } = await igdbLookup(
          config.igdb,
          rom!.title,
          rom!.platform_slug,
          matchOverride?.igdbGameId
        );
        if (error) errors.push(error);
        recordRequest("igdb", reqOk(error));
        return result ?? null;
      })();
    return igdbP;
  }

  let mobyP: Promise<MobyResult | null> | undefined;
  function getMoby() {
    if (!mobyP)
      mobyP = (async () => {
        const { result, error } = await mobyLookup(config.mobygames, rom!.title, rom!.platform_slug);
        if (error) errors.push(error);
        recordRequest("mobygames", reqOk(error));
        return result ?? null;
      })();
    return mobyP;
  }

  let tgdbP: Promise<TgdbResult | null> | undefined;
  function getTgdb() {
    if (!tgdbP)
      tgdbP = (async () => {
        const { result, error } = await tgdbLookup(config.thegamesdb, rom!.title, rom!.platform_slug);
        if (error) errors.push(error);
        recordRequest("thegamesdb", reqOk(error));
        return result ?? null;
      })();
    return tgdbP;
  }

  let sgdbP: Promise<SgdbResult | null> | undefined;
  function getSgdb() {
    if (!sgdbP)
      sgdbP = (async () => {
        const { result, error } = await sgdbLookup(config.steamgriddb, rom!.title);
        if (error) errors.push(error);
        recordRequest("steamgriddb", reqOk(error));
        return result ?? null;
      })();
    return sgdbP;
  }

  // LaunchBox lookups are local SQLite — cheap and synchronous
  let lbRes: LbResult | null | undefined;
  function getLb() {
    if (lbRes === undefined) {
      try {
        lbRes = matchOverride?.lbGameId
          ? lbLookupById(matchOverride.lbGameId)
          : lbLookup(identityName(), platform!);
      } catch (e) {
        errors.push(`LaunchBox: ${e instanceof Error ? e.message : e}`);
        lbRes = null;
      }
    }
    return lbRes;
  }

  // Flashpoint: automatic extra provider for the flash platform
  let fpP: Promise<FlashpointResult | null> | undefined;
  function getFp() {
    if (platform!.slug !== "flash") return Promise.resolve(null);
    if (!fpP)
      fpP = (async () => {
        const { result, error } = await flashpointLookup(rom!.title);
        if (error) errors.push(error);
        return result ?? null;
      })();
    return fpP;
  }

  let emP: Promise<{ client: Client; located: EmMediaResult } | null> | undefined;
  function getEm() {
    if (!emP)
      emP = (async () => {
        try {
          const client = await emSharedClient(config.emumovies);
          const located = await emLocate(client, platform!, rom!.title, rom!.filename);
          if (located.error) {
            errors.push(located.error);
            return null;
          }
          return { client, located };
        } catch (e) {
          errors.push(`EmuMovies: ${e instanceof Error ? e.message : e}`);
          return null;
        }
      })();
    return emP;
  }

  // EmuMovies transfers ride a single FTP control connection, which cannot run
  // concurrent commands — so serialize EmuMovies downloads even while the HTTP
  // providers below fetch in parallel.
  let emChain: Promise<unknown> = Promise.resolve();
  function withEmLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = emChain.then(fn, fn);
    emChain = run.catch(() => {});
    return run;
  }

  // ---- Metadata: merge down the priority list ----
  const wantAnyMeta = items.description || items.details;
  // [field, column, preserveExisting] — language/region come from authoritative
  // No-Intro filename tags at import, so scrapers only FILL them when empty.
  const DETAIL_COLUMNS: [keyof MetaFields, string, boolean][] = [
    ["developer", "developer", false],
    ["publisher", "publisher", false],
    ["genre", "genre", false],
    ["players", "players", false],
    ["rating", "rating", false],
    ["releaseDate", "release_date", false],
    ["language", "language", true],
    ["region", "region", true],
    ["ageRating", "age_rating", false],
    ["franchise", "franchise", false],
    ["gameModes", "game_modes", false],
    ["perspectives", "perspectives", false],
    ["themes", "themes", false],
    ["trailer", "trailer_url", false],
  ];

  function applyMeta(game: MetaFields, providerId: string) {
    let used = false;
    if (
      items.description &&
      game.description &&
      !updates.description &&
      !(fillMissingOnly && rom!.description)
    ) {
      updates.description = game.description;
      if (!got.includes("description")) got.push("description");
      used = true;
    }
    if (items.details) {
      let any = false;
      for (const [key, column, preserve] of DETAIL_COLUMNS) {
        // In backfill mode every field preserves its existing value (fill gaps
        // only); otherwise only the tag-derived fields (language/region) do.
        const existing =
          preserve || fillMissingOnly ? (rom![column as keyof RomRow] as unknown) : undefined;
        if (game[key] && !updates[column] && !existing) {
          updates[column] = game[key]!;
          any = true;
        }
      }
      if (any) {
        if (!got.includes("details")) got.push("details");
        used = true;
      }
    }
    if (used) sources.add(providerId);
  }

  function metaComplete(): boolean {
    const descDone = !items.description || !!updates.description;
    const detailsDone =
      !items.details ||
      (!!updates.developer &&
        !!updates.publisher &&
        !!updates.genre &&
        !!updates.rating &&
        !!updates.release_date);
    return descDone && detailsDone;
  }

  if (wantAnyMeta) {
    curPhase = "metadata";
    for (const provider of priority) {
      if (metaComplete()) break;
      if (!configured[provider]) continue;
      // Skip a provider that's over its API cap / under a 429 cooldown.
      if (quotaBlocked(provider)) continue;
      emit(`${label(provider)} — metadata`);
      let game: MetaFields | undefined;
      if (provider === "screenscraper") game = (await getSs())?.game;
      else if (provider === "igdb") game = (await getIgdb())?.game;
      else if (provider === "mobygames") game = (await getMoby())?.game;
      else if (provider === "thegamesdb") game = (await getTgdb())?.game;
      else if (provider === "launchbox") game = getLb()?.game;
      if (game) applyMeta(game, provider);
    }

    // Flashpoint is the archive of record for Flash games, but here it's a
    // generator fallback: consulted only after the configured providers, and
    // only if metadata is still missing.
    if (platform.slug === "flash" && !metaComplete()) {
      const fp = await getFp();
      if (fp?.game) applyMeta(fp.game, "flashpoint");
    }

    // Extra fields only the richer providers carry — franchise, game modes,
    // perspectives, themes. The core-field loop above stops early once the
    // basics are filled (usually by ScreenScraper), so gather these directly
    // from IGDB (remote, generous limits) and LaunchBox (local) rather than
    // hammering the rate-limited providers. Both lookups are memoized.
    if (items.details) {
      const extrasMissing = () =>
        !updates.franchise ||
        !updates.game_modes ||
        !updates.perspectives ||
        !updates.themes ||
        !updates.trailer_url;
      let igdbRes: IgdbResult | null | undefined;
      if (configured.igdb && !quotaBlocked("igdb")) {
        igdbRes = await getIgdb();
        if (igdbRes?.game) applyMeta(igdbRes.game, "igdb");
      }
      if (extrasMissing() && configured.launchbox) {
        const g = getLb()?.game;
        if (g) applyMeta(g, "launchbox");
      }

      // IGDB relational content (similar games, related editions, external
      // links) — none of the other providers carry it, so it comes straight
      // from the IGDB match and is refreshed whenever IGDB returns some.
      const related = igdbRes?.related;
      if (related && !(fillMissingOnly && rom!.igdb_related)) {
        updates.igdb_related = JSON.stringify(related);
        if (!got.includes("details")) got.push("details");
        sources.add("igdb");
      }
    }
  }

  // ---- Media: first provider in priority order that has each item ----
  const lrCandidates = libretroCandidates(platform, rom.filename, rom.title);
  const mediaTypes: { key: MediaKey; enabled: boolean; column: string; label: string }[] = [
    { key: "boxart", enabled: items.boxart, column: "boxart_url", label: "box art" },
    { key: "hero", enabled: items.hero, column: "hero_url", label: "hero" },
    { key: "logo", enabled: items.logo, column: "logo_url", label: "logo" },
    { key: "icon", enabled: items.icon, column: "icon_url", label: "icon" },
    { key: "screenshot", enabled: items.screenshot, column: "screenshot_url", label: "screenshot" },
    { key: "video", enabled: items.video, column: "video_url", label: "video" },
    { key: "manual", enabled: items.manual, column: "manual_url", label: "manual" },
    { key: "publisher_logo", enabled: items.badges, column: "publisher_image_url", label: "publisher logo" },
    { key: "developer_logo", enabled: items.badges, column: "developer_image_url", label: "developer logo" },
    { key: "rating_logo", enabled: items.badges, column: "rating_image_url", label: "rating badge" },
  ];

  async function saveHttpRef(
    ref: HttpRef | undefined,
    mt: (typeof mediaTypes)[number],
    providerId: string
  ): Promise<boolean> {
    if (!ref) return false;
    emit(`${label(providerId)} — ${mt.label}`);
    const buf = await fetchBuf(ref.url);
    if (!buf) return false;
    emit(`Converting ${mt.label} → WebP`);
    const file = await saveMedia(buf, dir, mt.key, ref.format);
    if (!file) return false;
    updates[mt.column] = mediaUrl(rom!.id, file);
    got.push(mt.label);
    sources.add(providerId);
    return true;
  }

  // Each media item is independent — it walks the provider priority list on its
  // own and stops at the first provider that has it. Because the item lookups
  // are already in hand (one API call per provider, memoized above), the only
  // real cost here is the file transfers, so run every enabled item's download
  // chain concurrently. saveHttpRef writes a distinct column/label per item, so
  // the shared updates/got/sources are never touched for the same key twice.
  async function fetchMedia(mt: (typeof mediaTypes)[number]): Promise<void> {
    // Take each item from the first provider that has it. A per-item preference
    // (Settings → Scraping) pulls one provider to the front FOR THIS ITEM ONLY,
    // then the normal Settings order fills in as fallthrough. Without one, it's
    // just the global order — so lower-priority generator sources (libretro,
    // SteamGridDB) act as fallbacks purely by sitting later in the list.
    const preferred = options.itemProviders[mt.key];
    const order =
      preferred && priority.includes(preferred)
        ? [preferred, ...priority.filter((p) => p !== preferred)]
        : priority;
    for (const provider of order) {
      if (!configured[provider]) continue;
      if (quotaBlocked(provider)) continue;
      let downloaded = false;

      if (provider === "screenscraper") {
        downloaded = await saveHttpRef((await getSs())?.media?.[mt.key], mt, provider);
      } else if (provider === "igdb") {
        downloaded = await saveHttpRef((await getIgdb())?.media[mt.key], mt, provider);
      } else if (provider === "mobygames") {
        downloaded = await saveHttpRef((await getMoby())?.media[mt.key], mt, provider);
      } else if (provider === "thegamesdb") {
        downloaded = await saveHttpRef((await getTgdb())?.media[mt.key], mt, provider);
      } else if (provider === "steamgriddb") {
        downloaded = await saveHttpRef((await getSgdb())?.media[mt.key], mt, provider);
      } else if (provider === "launchbox") {
        downloaded = await saveHttpRef(getLb()?.media[mt.key], mt, provider);
      } else if (provider === "libretro" && (mt.key === "boxart" || mt.key === "screenshot")) {
        for (const url of lrCandidates[mt.key]) {
          emit(`${label("libretro")} — ${mt.label}`);
          const buf = await fetchBuf(url);
          if (!buf) continue;
          emit(`Converting ${mt.label} → WebP`);
          const file = await saveMedia(buf, dir, mt.key, "png");
          if (file) {
            updates[mt.column] = mediaUrl(rom!.id, file);
            got.push(mt.label);
            sources.add("libretro");
            downloaded = true;
            break;
          }
        }
      } else if (provider === "emumovies") {
        const em = await getEm();
        // EmuMovies only carries A/V media (never logos/badges) — undefined for those
        const ref = (
          em?.located as
            | Partial<Record<MediaKey, { remote: string; ext: string; size?: number }>>
            | undefined
        )?.[mt.key];
        if (em && ref) {
          const file = `${mt.key}.${ref.ext}`;
          emit(`${label("emumovies")} — ${mt.label}`);
          // FTP has one command channel — serialize EmuMovies transfers.
          downloaded = await withEmLock(async () => {
            try {
              await emDownload(em.client, ref.remote, path.join(dir, file));
              updates[mt.column] = mediaUrl(rom!.id, file);
              got.push(mt.label);
              sources.add("emumovies");
              return true;
            } catch {
              errors.push(`EmuMovies ${mt.label} download failed`);
              return false;
            }
          });
        }
      }

      if (downloaded) break;
    }

    // Flashpoint is the media generator of last resort for Flash games — try it
    // only if every configured provider came up empty for this item.
    if (
      !updates[mt.column] &&
      platform!.slug === "flash" &&
      (mt.key === "boxart" || mt.key === "screenshot")
    ) {
      const fp = await getFp();
      if (fp) await saveHttpRef(fp.media[mt.key], mt, "flashpoint");
    }
  }

  // Each enabled media item downloads + WebP-converts concurrently; report the
  // running count + current sub-operation so the downloads page can show a
  // Steam-style secondary progress bar per game.
  const enabledMedia = mediaTypes.filter((mt) => mt.enabled);
  curPhase = "media";
  mediaTotal = enabledMedia.length;
  emit("Fetching artwork");
  await Promise.all(
    enabledMedia.map((mt) =>
      fetchMedia(mt).finally(() => {
        mediaDone++;
        emit();
      })
    )
  );

  const ok = sources.size > 0;
  if (ok) {
    // Keep the derived rating level in sync so kid-profile caps work on freshly
    // scraped games (SQLite's INTEGER affinity coerces the stringified value).
    if (updates.age_rating) {
      const lv = ratingLevel(updates.age_rating);
      if (lv != null) updates.rating_level = String(lv);
    }
    updates.metadata_source = [...sources].join("+");
    updates.scraped_at = new Date().toISOString();
    const setClause = Object.keys(updates)
      .map((k) => `${k} = @${k}`)
      .join(", ");
    db.prepare(`UPDATE roms SET ${setClause} WHERE id = @id`).run({ ...updates, id: rom.id });
  }

  return {
    romId: rom.id,
    title: rom.title,
    ok,
    sources: [...sources],
    got,
    error: errors.length ? errors.join("; ") : undefined,
  };
}
