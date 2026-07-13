// Console metadata scraping — the systems table (db.ts) is the store of record.
import { getProviderConfig, screenscraperConfigured } from "./providers/config";
import { ssSystemInfo } from "./providers/screenscraper";
import { lbPlatformMeta } from "./providers/launchbox";
import { getSystemMeta, setSystemMeta, type SystemMeta } from "./db";

export type { SystemMeta };
export { getSystemMeta };

/**
 * Scrape a console's metadata (manufacturer, type, year range, media format,
 * JP/alternate names) into the systems table. ScreenScraper is the primary
 * source; the imported LaunchBox platform DB fills any gaps (and stands in when
 * ScreenScraper isn't configured). Best-effort — returns whether anything was
 * stored.
 */
export async function scrapeSystemMeta(slug: string): Promise<boolean> {
  const config = getProviderConfig();
  const ss = screenscraperConfigured(config)
    ? await ssSystemInfo(config.screenscraper, slug).catch(() => null)
    : null;
  const lb = lbPlatformMeta(slug);
  if (!ss && !lb) return false;

  // ScreenScraper wins field-by-field; LaunchBox backfills the gaps.
  const pick = (a?: string | null, b?: string | null) => a ?? b ?? null;
  const source = [ss && "screenscraper", lb && "launchbox"].filter(Boolean).join("+");
  setSystemMeta(slug, {
    manufacturer: pick(ss?.manufacturer, lb?.manufacturer ?? lb?.developer),
    systemType: pick(ss?.systemType, lb?.systemType),
    yearStart: pick(ss?.yearStart, lb?.yearStart),
    yearEnd: ss?.yearEnd ?? null,
    mediaFormat: pick(ss?.mediaFormat, lb?.mediaFormat),
    nameJp: ss?.nameJp ?? null,
    altNames: ss?.altNames ?? null,
    source,
  });
  return true;
}
