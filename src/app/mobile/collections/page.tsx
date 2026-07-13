import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import {
  getDb,
  CollectionRow,
  countSmartCollection,
  parseSmartFilters,
  listSmartCollectionRoms,
  listVirtualCollections,
  VirtualDimension,
} from "@/lib/db";

export const dynamic = "force-dynamic";

const DIM_LABEL: Record<VirtualDimension, string> = {
  genre: "collections.byGenre",
  developer: "collections.byDeveloper",
  publisher: "collections.byPublisher",
};

async function CollageTile({
  href,
  name,
  count,
  smart,
  covers,
}: {
  href: string;
  name: string;
  count: number;
  smart?: boolean;
  covers: string[];
}) {
  const t = await getTranslations("mobilePagesB");
  const cells = covers.slice(0, 4);
  return (
    <Link
      href={href}
      className="overflow-hidden rounded-[12px] bg-[#1a1f27] ring-1 ring-white/5 active:ring-accent/40"
    >
      <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-px bg-black/30">
        {cells.length > 0 ? (
          Array.from({ length: 4 }).map((_, i) =>
            cells[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={cells[i]} alt="" className="h-full w-full object-cover" />
            ) : (
              <div key={i} className="h-full w-full bg-[#12161c]" />
            )
          )
        ) : (
          <div className="col-span-2 row-span-2 flex items-center justify-center bg-gradient-to-br from-[#1b2531] to-[#23262e] text-3xl text-white/20">
            ▤
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-bright">{name}</span>
            {smart && <span className="shrink-0 text-[11px] text-accent">⚡</span>}
          </div>
          <div className="text-[12px] text-dim">{t("collections.gamesCount", { count })}</div>
        </div>
      </div>
    </Link>
  );
}

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

  return (
    <div>
      <h1 className="mb-4 mt-1 text-[22px] font-black text-bright">{t("collections.title")}</h1>

      {meta.length > 0 && (
        <div className="mb-7 grid grid-cols-2 gap-3">
          {meta.map(({ c, smart, count, covers }) => (
            <CollageTile
              key={c.id}
              href={`/mobile/collections/${c.id}`}
              name={c.name}
              count={count}
              smart={smart}
              covers={covers}
            />
          ))}
        </div>
      )}

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
