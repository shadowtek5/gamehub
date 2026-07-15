import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getDb,
  getAllSystems,
  getHiddenSystems,
  searchLibraryBrowse,
  listFriends,
} from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";

// Universal search across games, systems, collections and friends. Static app
// pages (Home/Library/Settings…) are matched client-side in the palette.
const CAP = 6;

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) {
    return NextResponse.json({ games: [], systems: [], collections: [], friends: [] });
  }
  const db = getDb();
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const ql = q.toLowerCase();

  // Games — reuse the library browse (respects hidden + age restrictions).
  const games = searchLibraryBrowse(user.id, { q, limit: CAP }).rows.map((r) => ({
    id: r.id,
    title: r.title,
    platform_slug: r.platform_slug,
    boxart_url: r.boxart_url,
  }));

  // Systems — present platforms whose display name / short name / slug matches.
  const hidden = getHiddenSystems();
  const metaName = new Map(getAllSystems().map((s) => [s.slug, s.name]));
  const counts = db
    .prepare(
      "SELECT platform_slug AS slug, COUNT(*) AS count FROM roms WHERE missing = 0 GROUP BY platform_slug"
    )
    .all() as { slug: string; count: number }[];
  const systems = counts
    .filter((c) => !hidden.has(c.slug))
    .map((c) => {
      const p = platformBySlug(c.slug);
      const name = metaName.get(c.slug) || p?.name || c.slug;
      return { slug: c.slug, name, shortName: p?.shortName ?? c.slug, count: c.count };
    })
    .filter(
      (s) =>
        s.name.toLowerCase().includes(ql) ||
        s.shortName.toLowerCase().includes(ql) ||
        s.slug.toLowerCase().includes(ql)
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, CAP);

  // Collections — the user's own + public ones, by name.
  const collections = db
    .prepare(
      `SELECT id, name, is_smart AS isSmart FROM collections
        WHERE name LIKE ? COLLATE NOCASE AND (user_id = ? OR is_public = 1)
        ORDER BY name COLLATE NOCASE LIMIT ?`
    )
    .all(like, user.id, CAP) as { id: number; name: string; isSmart: number }[];

  // Friends — accepted friends whose name matches.
  const friends = listFriends(user.id)
    .filter((f) => f.name.toLowerCase().includes(ql))
    .slice(0, CAP)
    .map((f) => ({ id: f.id, name: f.name, avatar_url: f.avatar_url, presence: f.presence, playing: f.playing }));

  return NextResponse.json({ games, systems, collections, friends });
}
