import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getDb,
  CollectionRow,
  BrowseRomRow,
  browseFacets,
  listSmartCollectionRoms,
  countSmartCollection,
  parseSmartFilters,
  SmartFilters,
} from "@/lib/db";
import { getSystemIconMap } from "@/lib/systemArt";
import { platformBySlug } from "@/lib/platforms";
import { LANGUAGE_NAMES } from "@/lib/language";
import CollectionHero from "@/components/CollectionHero";
import LibraryBrowser from "@/components/LibraryBrowser";
import DeleteCollectionButton from "@/components/DeleteCollectionButton";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function filterChips(filters: SmartFilters, t: Translator): string[] {
  const statusLabels: Record<string, string> = {
    none: t("detail.statusNone"),
    backlog: t("detail.statusBacklog"),
    playing: t("detail.statusPlaying"),
    beaten: t("detail.statusBeaten"),
    dropped: t("detail.statusDropped"),
  };
  const chips: string[] = [];
  if (filters.platforms?.length) {
    chips.push(
      t("detail.filterSystem", {
        value: filters.platforms.map((s) => platformBySlug(s)?.shortName ?? s).join(", "),
      })
    );
  }
  if (filters.genres?.length) {
    chips.push(
      t("detail.filterGenre", {
        logic: filters.genres_logic === "all" ? t("detail.logicAll") : t("detail.logicAny"),
        value: filters.genres.join(", "),
      })
    );
  }
  if (filters.languages?.length) {
    chips.push(
      t("detail.filterLanguage", {
        logic: filters.languages_logic === "all" ? t("detail.logicAll") : t("detail.logicAny"),
        value: filters.languages.map((l) => LANGUAGE_NAMES[l] ?? l).join(", "),
      })
    );
  }
  if (filters.variants?.length) {
    chips.push(
      t("detail.filterVariant", {
        value: filters.variants
          .map((v) => (v === "main" ? t("detail.variantMain") : v))
          .join(", "),
      })
    );
  }
  if (filters.statuses?.length) {
    chips.push(
      t("detail.filterStatus", {
        value: filters.statuses.map((s) => statusLabels[s] ?? s).join(", "),
      })
    );
  }
  if (filters.search_term)
    chips.push(t("detail.filterTitleContains", { term: filters.search_term }));
  if (filters.playable) chips.push(t("detail.filterPlayable"));
  return chips;
}

interface CollectionStats {
  total: number;
  playtime_seconds: number;
  favorites: number;
  last_played_at: string | null;
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const t = await getTranslations("collectionsPages");
  const { id } = await params;
  const db = getDb();

  const collection = db
    .prepare(
      `SELECT c.*, u.username AS owner_name FROM collections c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = ? AND (c.user_id = ? OR c.is_public = 1)`
    )
    .get(Number(id), user.id) as (CollectionRow & { owner_name: string }) | undefined;
  if (!collection) notFound();
  const own = collection.user_id === user.id;
  const smart = collection.is_smart === 1;
  const filters = smart ? parseSmartFilters(collection.filters) : {};

  // Cover mosaic + stat bar for the hero. Smart collections aggregate over the
  // resolved match set (capped for the collage); standard collections over
  // their hand-picked membership.
  let stats: CollectionStats;
  let covers: string[];
  if (smart) {
    const roms: BrowseRomRow[] = listSmartCollectionRoms(user.id, filters, 1000);
    covers = roms.map((r) => r.boxart_url).filter((u): u is string => !!u).slice(0, 60);
    stats = {
      total: countSmartCollection(user.id, filters),
      playtime_seconds: roms.reduce((s, r) => s + (r.playtime_seconds || 0), 0),
      favorites: roms.filter((r) => r.favorite === 1).length,
      last_played_at: null,
    };
  } else {
    const agg = db
      .prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(ur.playtime_seconds), 0) AS playtime_seconds,
                COALESCE(SUM(CASE WHEN ur.favorite = 1 THEN 1 ELSE 0 END), 0) AS favorites,
                MAX(ur.last_played_at) AS last_played_at
         FROM collection_items ci
         JOIN roms r ON r.id = ci.rom_id AND r.missing = 0
         LEFT JOIN user_roms ur ON ur.rom_id = r.id AND ur.user_id = ?
         WHERE ci.collection_id = ?`
      )
      .get(user.id, collection.id) as CollectionStats;
    const coverRows = db
      .prepare(
        `SELECT r.boxart_url FROM collection_items ci
         JOIN roms r ON r.id = ci.rom_id AND r.missing = 0
         WHERE ci.collection_id = ? AND r.boxart_url IS NOT NULL AND r.boxart_url <> ''
         ORDER BY r.sort_title LIMIT 60`
      )
      .all(collection.id) as { boxart_url: string }[];
    covers = coverRows.map((r) => r.boxart_url);
    stats = agg;
  }

  const { platforms, variants, genres, languages } = browseFacets();
  const systemIcons = getSystemIconMap();

  return (
    <main
      className="-mt-10 pb-8"
      style={{
        backgroundColor: "#24282f",
        backgroundImage: "radial-gradient(100% 100% at 45% 35%, #2c323d 0%, #24282f 100%)",
      }}
    >
      <CollectionHero
        name={collection.name}
        description={collection.description}
        smart={smart}
        isPublic={collection.is_public === 1}
        ownerName={collection.owner_name}
        own={own}
        covers={covers}
        stats={stats}
        chips={smart ? filterChips(filters, t) : []}
        tools={own ? <DeleteCollectionButton collectionId={collection.id} /> : undefined}
      />
      <div className="px-[2.8vw] pt-6">
        <LibraryBrowser
          remote
          collectionLock={String(collection.id)}
          totalGames={stats.total}
          platforms={platforms}
          variants={variants}
          genres={genres}
          languages={languages}
          systemIcons={systemIcons}
        />
      </div>
    </main>
  );
}
