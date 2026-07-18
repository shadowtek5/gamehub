import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb, getAllSystems, getHiddenSystems } from "@/lib/db";
import { PLATFORMS_SORTED } from "@/lib/platforms";
import { getSystemIconMap } from "@/lib/systemArt";
import { getTranslations } from "next-intl/server";
import SystemIcon from "@/components/SystemIcon";

export const dynamic = "force-dynamic";

export default async function MobileSystemsPage() {
  await requireUser();
  const t = await getTranslations("mobilePagesA.systems");
  const counts = getDb()
    .prepare(
      `SELECT platform_slug,
              SUM(CASE WHEN missing = 0 THEN 1 ELSE 0 END) AS count,
              SUM(CASE WHEN missing = 0 AND scraped_at IS NULL THEN 1 ELSE 0 END) AS unscanned,
              SUM(CASE WHEN missing = 1 THEN 1 ELSE 0 END) AS not_found
       FROM roms GROUP BY platform_slug`
    )
    .all() as { platform_slug: string; count: number; unscanned: number; not_found: number }[];
  const countBySlug = new Map(counts.map((c) => [c.platform_slug, c.count]));
  const unscannedBySlug = new Map(counts.map((c) => [c.platform_slug, c.unscanned]));
  const notFoundBySlug = new Map(counts.map((c) => [c.platform_slug, c.not_found]));
  const hidden = getHiddenSystems();
  const icons = getSystemIconMap();
  // Scraped console metadata name (from "Update system info"), keyed by slug.
  const metaName = new Map(getAllSystems().map((s) => [s.slug, s.name]));
  const present = PLATFORMS_SORTED.filter((p) => (countBySlug.get(p.slug) ?? 0) > 0 && !hidden.has(p.slug))
    .map((p) => ({ p, name: metaName.get(p.slug) ?? p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <h1 className="mb-4 mt-1 text-[22px] font-black text-bright">{t("title")}</h1>
      {/* One line per system, showing the metadata name. */}
      <div className="flex flex-col gap-1.5">
        {present.map(({ p, name }) => (
          <Link
            key={p.slug}
            href={`/mobile/systems/${p.slug}`}
            className="flex items-center gap-3 rounded-[10px] bg-[#1a1f27] px-3 py-2.5 ring-1 ring-white/5 active:bg-[#232a34]"
          >
            <SystemIcon platform={p} size="sm" iconUrl={icons[p.slug] ?? undefined} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-bright">{name}</span>
            {/* total games / not scraped / not found */}
            <span
              className="shrink-0 text-[12px] tabular-nums"
              aria-label={t("countsLabel", {
                total: countBySlug.get(p.slug) ?? 0,
                unscanned: unscannedBySlug.get(p.slug) ?? 0,
                notFound: notFoundBySlug.get(p.slug) ?? 0,
              })}
            >
              <span className="text-dim">{(countBySlug.get(p.slug) ?? 0).toLocaleString()}</span>
              <span className="text-dim/40"> / </span>
              <span className={(unscannedBySlug.get(p.slug) ?? 0) > 0 ? "text-[#d9a441]" : "text-dim/40"}>
                {(unscannedBySlug.get(p.slug) ?? 0).toLocaleString()}
              </span>
              <span className="text-dim/40"> / </span>
              <span className={(notFoundBySlug.get(p.slug) ?? 0) > 0 ? "text-[#e5534b]" : "text-dim/40"}>
                {(notFoundBySlug.get(p.slug) ?? 0).toLocaleString()}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
