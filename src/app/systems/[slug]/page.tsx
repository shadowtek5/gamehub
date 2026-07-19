import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { browseFacets, getSystemHeroCovers, getSystemStats } from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";
import { getSystemArt } from "@/lib/systemArt";
import { getHeroCollageUrl } from "@/lib/systemThumb";
import { getSystemMeta } from "@/lib/systemMeta";
import LibraryBrowser from "@/components/LibraryBrowser";
import SystemTools from "@/components/SystemTools";
import SystemHero from "@/components/SystemHero";
import ScrollToTop from "@/components/ScrollToTop";

export const dynamic = "force-dynamic";

export default async function SystemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const platform = platformBySlug(slug);
  if (!platform) notFound();

  // Cards are paged in client-side via /api/library — only the facets and the
  // header stats are needed here
  const { variants, genres, languages } = browseFacets(platform.slug);
  const stats = getSystemStats(user.id, platform.slug);

  // Scraped hero/logo art (game-details style) with the top-rated box covers as
  // the collage fallback when the system has no scraped art yet.
  const art = getSystemArt(platform.slug);
  const meta = getSystemMeta(platform.slug);
  // The dense hero mosaic packs many small panels — fetch a generous set so a
  // large library fills the visible area without repeats.
  const heroCovers = getSystemHeroCovers(platform.slug, 60);

  return (
    <main
      className="-mt-10 pb-8"
      style={{
        // match the game-details page surface: lifted gray with a soft radial
        // highlight up-left of center
        backgroundColor: "#24282f",
        backgroundImage: "radial-gradient(100% 100% at 45% 35%, #2c323d 0%, #24282f 100%)",
      }}
    >
      <SystemHero
        platform={platform}
        art={art}
        meta={meta}
        covers={heroCovers}
        heroCollage={getHeroCollageUrl(platform.slug)}
        stats={stats}
        tools={
          user.isAdmin ? (
            <SystemTools
              slug={platform.slug}
              shortName={platform.shortName}
              covers={heroCovers}
              color={platform.color}
              heroSource={art.heroSource}
            />
          ) : undefined
        }
      />
      <div className="px-[2.8vw] pt-6">
        <LibraryBrowser
          remote
          platformLock={platform.slug}
          totalGames={stats.total}
          variants={variants}
          genres={genres}
          languages={languages}
          hidePlatformFilter
        />
      </div>
      <ScrollToTop />
    </main>
  );
}

