import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import MobileCollectionsView from "@/components/mobile/MobileCollectionsView";
import NewCollectionForm from "@/components/NewCollectionForm";
import {
  getDb,
  CollectionRow,
  countSmartCollection,
  parseSmartFilters,
  listSmartCollectionRoms,
  listVirtualCollections,
  browseFacets,
  VirtualDimension,
} from "@/lib/db";

export const dynamic = "force-dynamic";

const DIM_LABEL: Record<VirtualDimension, string> = {
  genre: "collections.byGenre",
  developer: "collections.byDeveloper",
  publisher: "collections.byPublisher",
};

export default async function MobileCollectionsPage() {
  const t = await getTranslations("mobilePagesB");
  const user = await requireUser();
  const db = getDb();
  const collections = db
    .prepare(
      `SELECT c.*, COUNT(ci.rom_id) AS item_count
       FROM collections c
       LEFT JOIN collection_items ci ON ci.collection_id = c.id
       WHERE c.user_id = ? OR c.is_public = 1
       GROUP BY c.id ORDER BY c.name`
    )
    .all(user.id) as (CollectionRow & { item_count: number })[];

  // A few covers per collection for the tile mosaic.
  const coverStmt = db.prepare(
    `SELECT r.boxart_url FROM collection_items ci
     JOIN roms r ON r.id = ci.rom_id AND r.missing = 0
     WHERE ci.collection_id = ? AND r.boxart_url IS NOT NULL AND r.boxart_url <> ''
     ORDER BY r.sort_title LIMIT 4`
  );
  const meta = collections.map((c) => {
    const smart = c.is_smart === 1;
    const filters = smart ? parseSmartFilters(c.filters) : null;
    const count = smart ? countSmartCollection(user.id, filters!) : c.item_count;
    const covers = smart
      ? listSmartCollectionRoms(user.id, filters!, 4).map((r) => r.boxart_url).filter((u): u is string => !!u)
      : (coverStmt.all(c.id) as { boxart_url: string }[]).map((r) => r.boxart_url);
    return { c, smart, count, covers };
  });

  const virtual = listVirtualCollections(user.id);
  const { platforms, variants, genres, languages } = browseFacets();

  return (
    <div>
      <div className="mb-4 mt-1 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-black text-bright">{t("collections.title")}</h1>
        <NewCollectionForm platforms={platforms} variants={variants} genres={genres} languages={languages} />
      </div>

      <MobileCollectionsView
        collections={meta.map(({ c, smart, count, covers }) => ({
          id: c.id,
          name: c.name,
          count,
          smart,
          covers,
        }))}
      />

      {(Object.keys(virtual) as VirtualDimension[]).map((dim) =>
        virtual[dim].length > 0 ? (
          <section key={dim} className="mb-6">
            <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-dim">
              {t(DIM_LABEL[dim])}
            </h2>
            <div className="flex flex-wrap gap-2">
              {virtual[dim].slice(0, 40).map((v) => (
                <Link
                  key={v.value}
                  href={`/mobile/collections/virtual/${dim}/${encodeURIComponent(v.value)}`}
                  className="rounded-full bg-[#1a1f27] px-3 py-1.5 text-[13px] text-body ring-1 ring-white/10 active:bg-[#232a34]"
                >
                  {v.value} <span className="text-dim">{v.count}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null
      )}
    </div>
  );
}
