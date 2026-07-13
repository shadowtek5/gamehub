// Auto-generated "library milestones" for the What's New feed. Derived purely
// from current library state (no event log): recent per-system additions and
// total-count thresholds you've crossed. Deterministic, so the same library
// always yields the same cards.

import { getDb } from "../db";
import { platformBySlug } from "../platforms";
import { getSystemArt } from "../systemArt";
import { NewsItem } from "./types";
import { bannerUrl } from "./banner";

const RECENT_DAYS = 21;
const MIN_BATCH = 5; // don't announce a system for a couple of stray files
const THRESHOLDS = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];

export function getMilestones(limit = 6): NewsItem[] {
  const db = getDb();
  const items: NewsItem[] = [];
  const since = new Date(Date.now() - RECENT_DAYS * 86400e3).toISOString().slice(0, 10);

  // Recent additions grouped by system.
  const perSystem = db
    .prepare(
      `SELECT platform_slug AS slug, COUNT(*) AS c, MAX(added_at) AS last
       FROM roms
       WHERE missing = 0 AND added_at IS NOT NULL AND substr(added_at, 1, 10) >= ?
       GROUP BY platform_slug
       HAVING c >= ?
       ORDER BY last DESC`
    )
    .all(since, MIN_BATCH) as { slug: string; c: number; last: string }[];

  for (const row of perSystem) {
    const platform = platformBySlug(row.slug);
    const name = platform?.name ?? row.slug;
    // Editorial banner like the other cards, tinted with the system's color; if
    // the console has a scraped logo we composite it on top of a clean plate,
    // otherwise the banner draws the system's short name.
    const logo = getSystemArt(row.slug).logo;
    items.push({
      id: `ms:add:${row.slug}:${row.last}`,
      source: "milestone",
      category: "Library",
      title: `${row.c.toLocaleString()} game${row.c === 1 ? "" : "s"} added to ${name}`,
      body: `Your ${name} collection grew recently — dive in and pick something new to play.`,
      image: bannerUrl("system", {
        color: platform?.color,
        text: platform?.shortName,
        bare: !!logo,
      }),
      overlay: logo,
      href: `/systems/${row.slug}`,
      date: row.last.length <= 10 ? `${row.last}T12:00:00.000Z` : row.last,
      accent: platform?.color ?? "#59bf40",
    });
  }

  // Total-library size threshold (most recently crossed).
  const totalRow = db
    .prepare("SELECT COUNT(*) AS c, MAX(added_at) AS last FROM roms WHERE missing = 0")
    .get() as { c: number; last: string | null };
  const total = totalRow.c;
  const crossed = [...THRESHOLDS].reverse().find((t) => total >= t);
  if (crossed && totalRow.last) {
    const systems = (
      db.prepare("SELECT COUNT(DISTINCT platform_slug) AS c FROM roms WHERE missing = 0").get() as { c: number }
    ).c;
    items.push({
      id: `ms:total:${crossed}`,
      source: "milestone",
      category: "Library",
      title: `Your library passed ${crossed.toLocaleString()} games`,
      body: `${total.toLocaleString()} games across ${systems} system${systems === 1 ? "" : "s"} and counting.`,
      image: bannerUrl("trophy", { number: crossed.toLocaleString() }),
      href: "/library",
      date: totalRow.last.length <= 10 ? `${totalRow.last}T12:00:00.000Z` : totalRow.last,
      accent: "#f0c040",
    });
  }

  items.sort((a, b) => b.date.localeCompare(a.date));
  return items.slice(0, limit);
}
