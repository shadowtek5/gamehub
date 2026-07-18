import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getDb, getAllSystems, getHiddenSystems, getSystemsHeroCovers, getUserRestriction } from "@/lib/db";
import { PLATFORMS_SORTED } from "@/lib/platforms";
import { getSystemArt } from "@/lib/systemArt";
import { getCardThumbUrl } from "@/lib/systemThumb";
import SystemsCardMenu, { SystemMenuInfo } from "@/components/SystemsCardMenu";
import SystemsView, { SystemCard } from "@/components/SystemsView";

export const dynamic = "force-dynamic";

export default async function SystemsPage() {
  const t = await getTranslations("systemsPages");
  const user = await requireUser();
  // Three per-system counts: present games (total), of which not-yet-scraped,
  // plus files that have gone missing (not found on disk, missing = 1).
  const counts = getDb()
    .prepare(
      `SELECT platform_slug,
              SUM(CASE WHEN missing = 0 THEN 1 ELSE 0 END) AS count,
              SUM(CASE WHEN missing = 0 AND scraped_at IS NULL THEN 1 ELSE 0 END) AS unscanned,
              SUM(CASE WHEN missing = 1 THEN 1 ELSE 0 END) AS not_found
       FROM roms
       GROUP BY platform_slug`
    )
    .all() as { platform_slug: string; count: number; unscanned: number; not_found: number }[];
  const countBySlug = new Map(counts.map((c) => [c.platform_slug, c.count]));
  const unscannedBySlug = new Map(counts.map((c) => [c.platform_slug, c.unscanned]));
  const notFoundBySlug = new Map(counts.map((c) => [c.platform_slug, c.not_found]));

  // Top-rated covers per system for the live collage fallback (only used before
  // a card thumbnail has been generated).
  const coversBySlug = getSystemsHeroCovers(6);

  const hidden = getHiddenSystems();
  // Restriction profiles only see their allowed systems (null = all).
  const allowed = getUserRestriction(user.id).allowedSystems;
  // Scraped console metadata name (from "Update system info"), keyed by slug —
  // this is what we display and sort by.
  const metaName = new Map(getAllSystems().map((s) => [s.slug, s.name]));

  const present = PLATFORMS_SORTED.filter(
    (p) =>
      (countBySlug.get(p.slug) ?? 0) > 0 &&
      !hidden.has(p.slug) &&
      (!allowed || allowed.includes(p.slug))
  )
    .map((p) => ({ p, name: metaName.get(p.slug) ?? p.name }))
    // Alphabetical by metadata name.
    .sort((a, b) => a.name.localeCompare(b.name));

  // Serializable card data for the client view (grid + list share it).
  const cards: SystemCard[] = present.map(({ p, name }) => {
    const art = getSystemArt(p.slug);
    return {
      slug: p.slug,
      name,
      count: countBySlug.get(p.slug) ?? 0,
      unscanned: unscannedBySlug.get(p.slug) ?? 0,
      notFound: notFoundBySlug.get(p.slug) ?? 0,
      thumb: getCardThumbUrl(p.slug) ?? null,
      covers: coversBySlug.get(p.slug) ?? [],
      icon: art.icon ?? null,
      ribbon: art.ribbon ?? null,
      logo: art.logo ?? null,
    };
  });

  // Data the per-card options menu needs (resolved server-side), keyed by slug.
  const menuData: SystemMenuInfo[] = present.map(({ p }) => {
    const art = getSystemArt(p.slug);
    return {
      slug: p.slug,
      shortName: p.shortName,
      color: p.color,
      covers: coversBySlug.get(p.slug) ?? [],
      heroSource: art.heroSource,
    };
  });

  return (
    <main className="px-[2.8vw] py-6">
      {cards.length === 0 ? (
        <>
          <h1 className="mb-6 text-2xl font-black text-bright">{t("list.title")}</h1>
          <p className="py-16 text-center text-dim">
            {t("list.emptyState")}
          </p>
        </>
      ) : (
        <SystemsView systems={cards} />
      )}
      {/* Tracks the focused/hovered card and hosts its cog menu (opened by the
          footer Options chip / gamepad Select). */}
      <SystemsCardMenu systems={menuData} />
    </main>
  );
}
