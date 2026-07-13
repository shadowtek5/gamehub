import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, getSystemFolders, getHiddenSystems } from "@/lib/db";
import { PLATFORMS_SORTED, platformPlayable, platformVendor } from "@/lib/platforms";

/** Platforms with games (or mapped folders), with counts and capabilities */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const counts = new Map<string, number>();
  for (const row of getDb()
    .prepare("SELECT platform_slug s, COUNT(*) c FROM roms WHERE missing = 0 GROUP BY platform_slug")
    .all() as { s: string; c: number }[]) {
    counts.set(row.s, row.c);
  }
  const mapped = new Set(getSystemFolders().map((f) => f.platform_slug));
  const hidden = getHiddenSystems();

  const platforms = PLATFORMS_SORTED.filter(
    (p) => (counts.get(p.slug) ?? 0) > 0 || mapped.has(p.slug)
  ).map((p) => ({
    slug: p.slug,
    name: p.name,
    shortName: p.shortName,
    vendor: platformVendor(p.slug),
    extensions: p.extensions,
    games: counts.get(p.slug) ?? 0,
    playable: platformPlayable(p),
    hidden: hidden.has(p.slug),
  }));
  return NextResponse.json({ platforms });
}
