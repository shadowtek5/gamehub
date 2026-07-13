import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAllSystems } from "@/lib/db";
import { scrapeSystemMeta } from "@/lib/systemMeta";

/**
 * Scrape console metadata for the chosen systems (or every registered system
 * when none are given). ScreenScraper's systemesListe is fetched once and
 * cached, so this is a single upstream call plus a DB write per system.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { systems } = await req.json().catch(() => ({}));
  const only = Array.isArray(systems)
    ? new Set(systems.filter((s): s is string => typeof s === "string"))
    : null;
  const targets = getAllSystems().filter((s) => !only || only.has(s.slug));

  let scraped = 0;
  for (const s of targets) {
    if (await scrapeSystemMeta(s.slug).catch(() => false)) scraped++;
  }
  return NextResponse.json({ ok: true, scraped });
}
