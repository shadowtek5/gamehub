import { requireUser } from "@/lib/auth";
import { browseFacets, listLibraryCollections, searchLibraryBrowse } from "@/lib/db";
import { getSystemIconMap } from "@/lib/systemArt";
import LibraryBrowser from "@/components/LibraryBrowser";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await requireUser();
  const { platforms, variants, genres, languages } = browseFacets();
  const collections = listLibraryCollections(user.id);
  // Stable "All Games" count for the tab (respects hidden/missing); one cheap
  // COUNT via the browse query with a 1-row window.
  const totalGames = searchLibraryBrowse(user.id, { countOnly: true }).total;
  const favoritesCount = searchLibraryBrowse(user.id, { tab: "favorites", countOnly: true }).total;
  const systemIcons = getSystemIconMap();
  return (
    // Steam library has no page heading — the collection tab strip is the top
    // chrome. ~38px side margins (2.8vw) match the measured grid inset.
    <main className="px-[2.8vw] pb-10 pt-3">
      <LibraryBrowser
        remote
        collections={collections}
        totalGames={totalGames}
        favoritesCount={favoritesCount}
        platforms={platforms}
        variants={variants}
        genres={genres}
        languages={languages}
        systemIcons={systemIcons}
      />
    </main>
  );
}
