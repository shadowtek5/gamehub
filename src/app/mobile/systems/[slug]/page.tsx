import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { browseFacets } from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";
import { getSystemArt } from "@/lib/systemArt";
import { getHeroCollageUrl } from "@/lib/systemThumb";
import MobileLibrary from "@/components/mobile/MobileLibrary";
import MobileSystemOptions from "@/components/mobile/MobileSystemOptions";
import MobileBackLink from "@/components/mobile/MobileBackLink";
import ScrollToTop from "@/components/ScrollToTop";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function MobileSystemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const t = await getTranslations("mobilePagesA.systemDetail");
  const { slug } = await params;
  const platform = platformBySlug(slug);
  if (!platform) notFound();
  const { genres, languages } = browseFacets(slug);

  // Delivered-default hero: scraped wallpaper first, then the cover-mosaic collage,
  // then a brand-wash gradient with the system's logo centered.
  const art = getSystemArt(slug);
  const heroImg = art.heroSource === "image" ? art.hero ?? art.ribbon : null;
  const heroCollage = !heroImg ? getHeroCollageUrl(slug) : null;
  const overArt = !!heroImg || !!heroCollage;
  const wash = `linear-gradient(135deg, color-mix(in srgb, ${platform.color} 58%, #e6ecf4) 0%, color-mix(in srgb, ${platform.color} 55%, #0c1017) 48%, #0a0e13 100%)`;
  const showLogo = !!art.logo && !(heroImg && !art.hero); // skip over a branded marquee

  return (
    <div>
      <div
        className="relative mb-4 mt-1 aspect-[16/7] overflow-hidden rounded-xl ring-1 ring-white/10"
        style={{ background: overArt ? "#0b0f14" : wash }}
      >
        {heroImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : heroCollage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroCollage} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        {showLogo && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 pb-9">
            {overArt && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(50% 50% at 50% 45%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 45%, transparent 72%)",
                }}
              />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={art.logo!}
              alt={platform.name}
              className="relative max-h-[64%] max-w-[74%] object-contain [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.9))_drop-shadow(0_2px_10px_rgba(0,0,0,0.6))]"
            />
          </div>
        )}
        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
          <MobileBackLink
            href="/mobile/systems"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
            aria-label={t("backToSystems")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
            </svg>
          </MobileBackLink>
          {user.isEditor && <MobileSystemOptions slug={slug} shortName={platform.shortName} />}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-black/80 to-transparent" />
        <h1 className="absolute inset-x-0 bottom-0 z-20 truncate px-3 pb-2 text-[18px] font-black text-bright drop-shadow">
          {platform.name}
        </h1>
      </div>
      <MobileLibrary platformLock={slug} genres={genres} languages={languages} />
      <ScrollToTop className="bottom-[84px] right-4" />
    </div>
  );
}
