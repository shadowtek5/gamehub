import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  browseFacets,
  listVirtualCollectionRoms,
  countVirtualCollection,
  VirtualDimension,
  VIRTUAL_DIMENSIONS,
} from "@/lib/db";
import { getSystemIconMap } from "@/lib/systemArt";
import CollectionHero from "@/components/CollectionHero";
import LibraryBrowser from "@/components/LibraryBrowser";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

// Purple tone marks the auto-generated (read-only) virtual collections apart
// from the blue hand-picked / smart ones.
const VIRTUAL_ACCENT = "#6a4b8a";

export default async function VirtualCollectionPage({
  params,
}: {
  params: Promise<{ dimension: string; value: string }>;
}) {
  const user = await requireUser();
  const t = await getTranslations("collectionsPages");
  const { dimension, value: rawValue } = await params;
  if (!VIRTUAL_DIMENSIONS.includes(dimension as VirtualDimension)) notFound();
  const dim = dimension as VirtualDimension;
  const value = decodeURIComponent(rawValue);

  const total = countVirtualCollection(dim, value);
  if (total === 0) notFound();

  // Sample the match set for the collage + stat aggregation (capped for speed).
  const roms = listVirtualCollectionRoms(user.id, dim, value, 1000);
  const covers = roms
    .map((r) => r.boxart_url)
    .filter((u): u is string => !!u)
    .slice(0, 60);
  const stats = {
    total,
    playtime_seconds: roms.reduce((s, r) => s + (r.playtime_seconds || 0), 0),
    favorites: roms.filter((r) => r.favorite === 1).length,
    last_played_at: null,
  };

  const label = {
    genre: t("virtual.dimGenre"),
    developer: t("virtual.dimDeveloper"),
    publisher: t("virtual.dimPublisher"),
  }[dim];
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
        name={value}
        covers={covers}
        stats={stats}
        accent={VIRTUAL_ACCENT}
        glyph="🤖"
        kindLabel={t("virtual.kindLabel", { label })}
        statusText={t("virtual.statusText", { label: label.toLowerCase() })}
        badge={
          <span
            className="rounded bg-[#6a4b8a]/45 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#c9a6ee] [text-shadow:none]"
            title={t("virtual.badgeTitle")}
          >
            {t("virtual.badgeLabel", { label })}
          </span>
        }
      />
      <div className="px-[2.8vw] pt-6">
        <LibraryBrowser
          remote
          virtualLock={{ dim, value }}
          totalGames={total}
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
