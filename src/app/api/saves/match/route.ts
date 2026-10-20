import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_NAMES = 5000;

/**
 * Maps save file base names to library games, for sync clients pairing local
 * saves (e.g. RetroArch's "<ROM name>.srm") with GameHub ROMs.
 * Body: { names: string[], platforms?: string[] }
 * → { matches: { [name]: [{ id, platform, title }] } } — names with no match are omitted.
 * A name matches a ROM whose file name without its extension equals it (case-insensitive).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const names: string[] = Array.isArray(body.names)
    ? [...new Set<string>(body.names.filter((n: unknown): n is string => typeof n === "string" && n.length > 0 && n.length <= 300))].slice(0, MAX_NAMES)
    : [];
  const platforms: string[] = Array.isArray(body.platforms)
    ? body.platforms.filter((p: unknown): p is string => typeof p === "string")
    : [];
  if (names.length === 0) return NextResponse.json({ matches: {} });

  const wanted = new Map(names.map((n) => [n.toLowerCase(), n]));
  const platformFilter = platforms.length ? ` AND platform_slug IN (${platforms.map(() => "?").join(",")})` : "";
  const rows = getDb()
    .prepare(`SELECT id, filename, platform_slug, title FROM roms WHERE missing = 0${platformFilter}`)
    .iterate(...platforms) as Iterable<{ id: number; filename: string; platform_slug: string; title: string }>;

  const matches: Record<string, { id: number; platform: string; title: string }[]> = {};
  for (const r of rows) {
    const dot = r.filename.lastIndexOf(".");
    const base = (dot > 0 ? r.filename.slice(0, dot) : r.filename).toLowerCase();
    const name = wanted.get(base);
    if (name) (matches[name] ??= []).push({ id: r.id, platform: r.platform_slug, title: r.title });
  }
  return NextResponse.json({ matches });
}
