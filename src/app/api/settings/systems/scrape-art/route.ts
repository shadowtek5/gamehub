import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAllSystems } from "@/lib/db";
import { scrapeSystemArt } from "@/lib/systemArt";

/**
 * Force-fetch system artwork (hero/logo/icon/ribbon) for the chosen systems, or
 * every registered system when none are given. Always forces — a manual scrape
 * replaces whatever art is already stored.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { systems } = await req.json().catch(() => ({}));
  const only = Array.isArray(systems)
    ? new Set(systems.filter((s): s is string => typeof s === "string"))
    : null;
  const targets = getAllSystems().filter((s) => !only || only.has(s.slug));

  let updated = 0;
  for (const s of targets) {
    const { got } = await scrapeSystemArt(s.slug, true).catch(() => ({ got: [] as string[] }));
    if (got.length) updated++;
  }
  return NextResponse.json({ ok: true, updated });
}
