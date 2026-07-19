import { requireUser } from "@/lib/auth";
import {
  getDb,
  CollectionRow,
  browseFacets,
  countSmartCollection,
  parseSmartFilters,
  listSmartCollectionRoms,
  listVirtualCollections,
  VirtualDimension,
} from "@/lib/db";
import NewCollectionForm from "@/components/NewCollectionForm";
import CollectionsView, { type CollectionCardData, type DimensionSection } from "@/components/CollectionsView";
import ScrollToTop from "@/components/ScrollToTop";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const user = await requireUser();
  const t = await getTranslations("collectionsPages");
  const db = getDb();
  const collections = db
    .prepare(
      `SELECT c.*, u.username AS owner_name, COUNT(ci.rom_id) AS item_count
       FROM collections c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN collection_items ci ON ci.collection_id = c.id
       WHERE c.user_id = ? OR c.is_public = 1
       GROUP BY c.id ORDER BY c.name`
    )
    .all(user.id) as (CollectionRow & { owner_name: string })[];

  // Smart membership is computed live (against the viewer's own statuses)
  const counts = new Map<number, number>();
  for (const c of collections) {
    counts.set(
      c.id,
      c.is_smart === 1
        ? countSmartCollection(user.id, parseSmartFilters(c.filters))
        : (c.item_count ?? 0)
    );
  }

  // A few cover images per collection for the tile collage. Standard
  // collections come from one windowed query; smart collections resolve their
  // live membership.
  const covers = new Map<number, string[]>();
  const standardIds = collections.filter((c) => c.is_smart !== 1).map((c) => c.id);
  if (standardIds.length > 0) {
    const rows = db
      .prepare(
        `SELECT collection_id, boxart_url FROM (
           SELECT ci.collection_id, r.boxart_url,
             ROW_NUMBER() OVER (PARTITION BY ci.collection_id ORDER BY r.sort_title) AS rn
           FROM collection_items ci
           JOIN roms r ON r.id = ci.rom_id AND r.missing = 0
           WHERE r.boxart_url IS NOT NULL AND r.boxart_url <> ''
             AND ci.collection_id IN (${standardIds.map(() => "?").join(",")})
         ) WHERE rn <= 4`
      )
      .all(...standardIds) as { collection_id: number; boxart_url: string }[];
    for (const r of rows) {
      const arr = covers.get(r.collection_id) ?? [];
      arr.push(r.boxart_url);
      covers.set(r.collection_id, arr);
    }
  }
  for (const c of collections) {
    if (c.is_smart === 1) {
      const art = listSmartCollectionRoms(user.id, parseSmartFilters(c.filters), 4)
        .map((r) => r.boxart_url)
        .filter((u): u is string => !!u);
      if (art.length) covers.set(c.id, art);
    }
  }

  const { platforms, variants, genres, languages } = browseFacets();
  const virtual = listVirtualCollections();
  const dimensionMeta: { key: VirtualDimension; label: string }[] = [
    { key: "genre", label: t("index.dimGenres") },
    { key: "developer", label: t("index.dimDevelopers") },
    { key: "publisher", label: t("index.dimPublishers") },
  ];

  // Cover collages for virtual collections, keyed lowercase per dimension.
  const vCovers: Record<VirtualDimension, Map<string, string[]>> = {
    genre: new Map(),
    developer: new Map(),
    publisher: new Map(),
  };
  // developer / publisher: one windowed query each
  for (const dim of ["developer", "publisher"] as const) {
    const rows = db
      .prepare(
        `SELECT v, boxart_url FROM (
           SELECT r.${dim} COLLATE NOCASE AS v, r.boxart_url,
             ROW_NUMBER() OVER (PARTITION BY r.${dim} COLLATE NOCASE ORDER BY r.sort_title) AS rn
           FROM roms r
           WHERE r.missing = 0 AND r.${dim} IS NOT NULL
             AND r.boxart_url IS NOT NULL AND r.boxart_url <> ''
         ) WHERE rn <= 4`
      )
      .all() as { v: string; boxart_url: string }[];
    for (const r of rows) {
      const k = r.v.toLowerCase();
      const arr = vCovers[dim].get(k) ?? [];
      arr.push(r.boxart_url);
      vCovers[dim].set(k, arr);
    }
  }
  // genre is comma-separated — tokenize in JS, capping 4 covers per token and
  // stopping once every wanted genre is filled.
  {
    const wanted = new Set(virtual.genre.map((e) => e.value.toLowerCase()));
    if (wanted.size > 0) {
      const rows = db
        .prepare(
          `SELECT genre, boxart_url FROM roms
           WHERE missing = 0 AND genre IS NOT NULL
             AND boxart_url IS NOT NULL AND boxart_url <> '' ORDER BY rowid`
        )
        .all() as { genre: string; boxart_url: string }[];
      let filled = 0;
      for (const r of rows) {
        if (filled >= wanted.size) break;
        for (const t of r.genre.split(",")) {
          const k = t.trim().toLowerCase();
          if (!k || !wanted.has(k)) continue;
          const arr = vCovers.genre.get(k) ?? [];
          if (arr.length < 4) {
            arr.push(r.boxart_url);
            vCovers.genre.set(k, arr);
            if (arr.length === 4) filled++;
          }
        }
      }
    }
  }

  const collectionCards: CollectionCardData[] = collections.map((c) => ({
    id: c.id,
    name: c.name,
    count: counts.get(c.id) ?? 0,
    covers: covers.get(c.id) ?? [],
    isOwn: c.user_id === user.id,
    ownerName: c.owner_name,
    isSmart: c.is_smart === 1,
    isPublic: c.is_public === 1,
  }));

  const dimensions: DimensionSection[] = dimensionMeta.map(({ key, label }) => ({
    key,
    label,
    entries: virtual[key].map((e) => ({
      value: e.value,
      count: e.count,
      covers: vCovers[key].get(e.value.toLowerCase()) ?? [],
    })),
  }));

  return (
    <main className="px-[2.8vw] py-6">
      <CollectionsView
        title={t("index.title")}
        collections={collectionCards}
        dimensions={dimensions}
        autoGeneratedNote={t("index.autoGeneratedNote")}
        emptyVirtualNote={t("index.emptyVirtual")}
        actions={
          <NewCollectionForm
            platforms={platforms}
            variants={variants}
            genres={genres}
            languages={languages}
          />
        }
      />
      <ScrollToTop />
    </main>
  );
}
