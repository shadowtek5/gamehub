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
      `SELECT platform_slug, COUNT(*) AS count,
              SUM(CASE WHEN scraped_at IS NULL THEN 1 ELSE 0 END) AS unscanned
       FROM roms WHERE missing = 0 GROUP BY platform_slug`
    )
    .all() as { platform_slug: string; count: number; unscanned: number }[];
  const countBySlug = new Map(counts.map((c) => [c.platform_slug, c.count]));
  const unscannedBySlug = new Map(counts.map((c) => [c.platform_slug, c.unscanned]));
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
            {(unscannedBySlug.get(p.slug) ?? 0) > 0 && (
              <span className="shrink-0 text-[11px] tabular-nums text-[#d9a441]">
                {t("unscanned", { count: unscannedBySlug.get(p.slug) ?? 0 })}
              </span>
            )}
            <span className="shrink-0 text-[12px] tabular-nums text-dim">
              {(countBySlug.get(p.slug) ?? 0).toLocaleString()}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
