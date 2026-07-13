"use client";

// BPM home — rebuilt 1:1 from a LIVE Big Picture capture (scratchpad/
// live-home-full.txt, 2026-07-07, 1348x758): radial-gradient page backing,
// radially-masked backdrop of the focused game at brightness(.5), the
// Recent Games carousel (564px featured slot with landscape art + glow =
// a duplicated capsule image at saturate(3) brightness(2) blur(3px),
// 184px portrait slots at brightness(.9), hidden 22px header label,
// "New to library" banner chips, trailing View-More tile), then the
// three-tab strip (What's New · Friends · Recommended) and its content:
// event cards, a date-grouped activity feed, and the Play Next shelf.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { animated, useSpring } from "@react-spring/web";
import GameCover from "@/components/GameCover";
import GameCardCog from "@/components/GameCardCog";
import { GpPill } from "@/components/bpm/primitives";
import { platformBySlug } from "@/lib/platforms";
import { formatPlaytime } from "@/lib/format";
import type { NewsSection, NewsItem } from "@/lib/news/types";

export interface HomeRom {
  id: number;
  title: string;
  boxart_url: string | null;
  hero_url: string | null;
  screenshot_url: string | null;
  platform_slug: string;
  playtime_seconds: number;
  added_at: string | null;
}

/** One Recommended shelf (games already slimmed for the client). */
export interface HomeShelf {
  key: string;
  title: string;
  subtitle: string;
  roms: HomeRom[];
}

export interface HomeActivity {
  userName: string;
  avatarUrl: string | null;
  rom: HomeRom;
  playedAt: string; // ISO
}

const NEW_CUTOFF_DAYS = 7;

function isNew(rom: HomeRom): boolean {
  if (!rom.added_at) return false;
  return Date.now() - new Date(rom.added_at).getTime() < NEW_CUTOFF_DAYS * 86400e3;
}

// Steam uses TWO DISTINCT landscape assets, verified from a live capture:
//   • the blurred full-width BACKDROP = library_hero.jpg  → our fanart/hero
//   • the sharp FEATURED CAPSULE      = header.jpg (NOT the hero!) → our screenshot
// Keeping them separate is why the hovered capsule and the background never
// show the same image. Prefer screenshot for the capsule so it differs from
// the hero backdrop; the hero is background-only.
function backdropArt(rom: HomeRom): string | null {
  return rom.hero_url ?? rom.screenshot_url;
}
function bannerArt(rom: HomeRom): string | null {
  return rom.screenshot_url ?? null;
}

/** Featured (focused) capsule: Steam's 552x258 slot showing the header-style
 *  banner (screenshot), NOT the hero. Box-art-only games fall back to their
 *  cover centered over a blurred fill. */
function FeaturedCapsule({ rom }: { rom: HomeRom }) {
  const [failed, setFailed] = useState(false);
  const art = bannerArt(rom);
  const platform = platformBySlug(rom.platform_slug);
  useEffect(() => setFailed(false), [rom.id]);
  if (art && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={art}
        alt=""
        onError={() => setFailed(true)}
        className="libraryassetimage_Image_gh h-full w-full object-cover [filter:brightness(1.1)_contrast(0.95)]"
      />
    );
  }
  // no wide banner: blurred cover fill + the portrait cover centered
  // (GameCover handles a missing cover with the platform-tinted title card,
  // so assetless games still fill the slot instead of going dark)
  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{ background: `linear-gradient(120deg, ${platform?.color ?? "#2a475e"}44, #0e141b 90%)` }}
    >
      {rom.boxart_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={rom.boxart_url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl" />
      )}
      <GameCover
        title={rom.title}
        boxartUrl={rom.boxart_url}
        color={platform?.color}
        shortName={platform?.shortName}
        className="relative h-full w-[172px] shadow-2xl"
      />
    </div>
  );
}

/** The carousel-item glow: the SAME art duplicated behind the capsule at
 *  saturate(3) brightness(2) blur(3px) and 50% opacity (measured live);
 *  spring-faded like Steam (react-spring is in Steam's own licenses). */
function CapsuleGlow({ rom, visible }: { rom: HomeRom; visible: boolean }) {
  // glow = a blurred duplicate of the capsule's OWN image (Steam: header for
  // the featured item), so it matches whatever the featured capsule shows
  const art = bannerArt(rom) ?? rom.boxart_url;
  const spring = useSpring({ opacity: visible ? 0.5 : 0, config: { tension: 210, friction: 24 } });
  if (!art) return null;
  return (
    <animated.div
      style={spring}
      className="basicgamecarousel_CarouselCapsuleBackgroundGlow_gh libraryassetimage_Container_gh pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[210px] w-[76%] -translate-x-1/2 -translate-y-[40%] [filter:saturate(3)_brightness(2)_blur(3px)]"
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art} alt="" className="h-full w-full object-cover" />
    </animated.div>
  );
}

/** Carousel slot — FIXED width by position (item 0 is a permanent 564px
 *  landscape hero, all others 184px portrait; verified from a live capture).
 *  Focus does NOT change the shape — it springs a slight scale-up (Steam's
 *  172x258 → 181x272 ≈ 1.05) with a focus ring, matching BPM exactly. */
function CarouselSlot({
  landscape,
  focused,
  children,
}: {
  landscape: boolean;
  focused: boolean;
  children: React.ReactNode;
}) {
  const spring = useSpring({
    scale: focused ? (landscape ? 1.02 : 1.05) : 1,
    config: { tension: 300, friction: 26 },
  });
  return (
    <animated.div
      style={{ width: landscape ? 564 : 184, scale: spring.scale, zIndex: focused ? 10 : 1 }}
      className="basicgamecarousel_BasicGameCarouselItem_gh relative shrink-0"
    >
      {children}
    </animated.div>
  );
}

/** Portrait capsule used by every Recommended shelf. */
function PortraitCard({ rom }: { rom: HomeRom }) {
  const platform = platformBySlug(rom.platform_slug);
  return (
    <div className="group relative shrink-0">
      <Link
        href={`/game/${rom.id}`}
        data-rom-id={rom.id}
        className="gamecapsule_GameCapsule_gh appportrait_LibraryItemBox_gh appportrait_Portrait_gh deck-capsule deck-shimmer block w-[172px]"
        title={rom.title}
      >
        <span className="libraryassetimage_Container_gh appportrait_PortraitImage_gh block h-[258px] w-[172px] overflow-hidden rounded-[3px] bg-[#0e141b]">
          <GameCover
            title={rom.title}
            boxartUrl={rom.boxart_url}
            color={platform?.color}
            shortName={platform?.shortName}
            className="h-full w-full"
          />
        </span>
      </Link>
      <GameCardCog romId={rom.id} />
    </div>
  );
}

/** A titled horizontal shelf of portrait capsules (Recommended tab). */
function RecommendedShelf({ shelf }: { shelf: HomeShelf }) {
  return (
    <section className="mb-9">
      <h2 className="gamepadhomerecommended_PlayNextCarouselTitle_gh text-[22px] font-bold text-bright">
        {shelf.title}
      </h2>
      <p className="gamepadhomerecommended_PlayNextCarouselSubHeading_gh mb-4 text-[13px] text-dim">
        {shelf.subtitle}
      </p>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {shelf.roms.map((rom) => (
          <PortraitCard key={rom.id} rom={rom} />
        ))}
      </div>
    </section>
  );
}

/** One news card — Steam's 300px event-card shape. External items link out (new
 *  tab); the rest link nowhere. Text-only sources get a colored header band with
 *  the category so they still read as event cards. */
function NewsCard({ item }: { item: NewsItem }) {
  const t = useTranslations("home");
  const accent = item.accent ?? "#1a9fff";
  const external = !!item.url;
  const date = item.date ? item.date.slice(0, 10) : "";
  const inner = (
    <>
      <div className="gamepadhomewhatsnew_EventImageWrapper_gh relative h-[132px] w-[300px] overflow-hidden rounded-t-[3px]">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-end p-3"
            style={{ background: `linear-gradient(135deg, ${accent}cc, #0e141b 92%)` }}
          >
            <span className="text-[13px] font-bold uppercase tracking-[1px] text-white/90">
              {item.category}
            </span>
          </div>
        )}
        {/* real art (e.g. a system logo) composited over the generated banner */}
        {item.overlay && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.overlay}
            alt=""
            loading="lazy"
            className="pointer-events-none absolute inset-0 m-auto max-h-[62%] max-w-[58%] object-contain [filter:drop-shadow(0_2px_10px_rgba(0,0,0,0.6))]"
          />
        )}
      </div>
      <div className="gamepadhomewhatsnew_EventInfo_gh flex h-[150px] flex-col rounded-b-[3px] bg-white/[0.07] px-[12px] py-[11px]">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-dim">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: accent }} />
          <span className="truncate">{item.category}</span>
          {date && <span className="ml-auto text-dim/80">{date}</span>}
        </div>
        <div className="mt-1.5 line-clamp-2 text-[15px] font-semibold leading-[20px] text-bright">
          {item.title}
        </div>
        {item.body && (
          <div className="mt-1 line-clamp-3 text-[12px] leading-[17px] text-body/80">{item.body}</div>
        )}
        {external && (
          <div className="mt-auto pt-2 text-[12px] font-semibold text-accent">{t("readMore")}</div>
        )}
      </div>
    </>
  );
  const cls = "gamepadhomewhatsnew_EventPreviewContainer_gh deck-card block w-[300px] shrink-0 overflow-hidden";
  if (item.href) {
    // internal navigation (milestones → system page / library), same tab
    return (
      <Link href={item.href} className={cls} title={item.title}>
        {inner}
      </Link>
    );
  }
  return external ? (
    <a href={item.url!} target="_blank" rel="noopener noreferrer" className={cls} title={item.title}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** A titled horizontal shelf of news cards (What's New tab). When `moreHref` is
 *  set, a trailing "View more" tile (same treatment as the Recent Games
 *  carousel's tile) links to the full list. */
function NewsShelf({ section, moreHref }: { section: NewsSection; moreHref?: string }) {
  const t = useTranslations("home");
  return (
    <section className="mt-8">
      <h3 className="mb-3 text-[18px] font-bold text-bright">{section.title}</h3>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {section.items.map((item) => (
          <NewsCard key={item.id} item={item} />
        ))}
        {moreHref && (
          <Link
            href={moreHref}
            className="basicgamecarousel_TextBoxCarouselContents_gh deck-card flex h-[282px] w-[200px] shrink-0 items-center justify-center rounded-[3px] p-4 text-center text-[15px] font-semibold text-body"
            style={{
              backgroundImage:
                "linear-gradient(313deg, rgba(51,51,51,0.667), rgba(85,85,85,0.667))",
            }}
          >
            {t("viewMore")}
          </Link>
        )}
      </div>
    </section>
  );
}

export default function Home({
  recent,
  whatsNew,
  activity,
  recommended,
  news,
}: {
  recent: HomeRom[];
  whatsNew: HomeRom[];
  activity: HomeActivity[];
  recommended: HomeShelf[];
  news: NewsSection[];
}) {
  const t = useTranslations("home");
  const [focused, setFocused] = useState<HomeRom | undefined>(recent[0]);
  const [tab, setTab] = useState<"new" | "friends" | "recommended">("new");
  const carousel = useRef<HTMLDivElement>(null);

  // Sticky tab header, same treatment as the game-details page: a sentinel just
  // above the tab row flips `stuck` when it scrolls out, extending a frosted bar
  // up over the site header so content doesn't bleed through.
  const [stuck, setStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const backdrop = focused ? backdropArt(focused) : null;

  // group activity by calendar day, Steam's Activity feed style
  const activityDays: { day: string; items: HomeActivity[] }[] = [];
  for (const a of activity) {
    const day = new Date(a.playedAt)
      .toLocaleDateString([], { month: "long", day: "numeric" })
      .toUpperCase();
    const bucket = activityDays.find((d) => d.day === day);
    if (bucket) bucket.items.push(a);
    else activityDays.push({ day, items: [a] });
  }

  const TABS = [
    { key: "new" as const, label: t("tabNew") },
    { key: "friends" as const, label: t("tabFriends") },
    { key: "recommended" as const, label: t("tabRecommended") },
  ];

  return (
    // Steam nesting: BasicHome+OpaqueBackground root. The default radial page
    // gradient comes from `body` (globals.css, background-attachment:fixed) so
    // this element stays transparent — themes paint their own home background
    // here via [BasicHome_][OpaqueBackground_] (e.g. Pip-Boy's bg.png). An
    // inline background here would beat every theme rule (inline > stylesheet),
    // so it must NOT be set inline. TabbedContent (child) themes make transparent.
    <div
      className="gamepadui_BasicHome_gh gamepadui_OpaqueBackground_gh relative -mt-10 -mb-[42px] min-h-screen"
    >
      <div className="gamepadhome_TabbedContent_gh min-h-full pb-[42px]">
        {/* ---- Recent Games section (454px zone, measured) ---- */}
        <div className="gamepadhome_RecentSection_gh gamepadhomerecentgames_RecentGamesContainer_gh relative h-[454px]">
          {/* backdrop: focused game's landscape art — a SOLID darkened
              rectangle, NOT a vignette. Verified on the real Deck: the hero
              (libraryassetimage_Image) is filter:brightness(0.5) with mask=none
              and no fade overlay; the theme's bg fills the home BEHIND it and
              only shows BELOW the hero. An earlier radial mask here faded the
              hero on all sides, letting the background bleed in above/around
              the hero — removed so it matches the Deck. */}
          <div
            className="gamepadhomerecentgames_RecentGamesBackgroundContainer_gh pointer-events-none absolute inset-0 overflow-hidden"
          >
            <div className="gamepadhomerecentgames_RecentGamesBackgroundImages_gh libraryassetimage_Container_gh gamepadhomerecentgames_RecentGamesBackground_gh absolute inset-0">
              {backdrop && (
                // key by src so it remounts and crossfades on focus change,
                // like Steam's background transition
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={backdrop}
                  src={backdrop}
                  alt=""
                  aria-hidden
                  className="gamepadhomerecentgames_RecentGamesBackgroundImage_gh libraryassetimage_Image_gh deck-backdrop deck-hero-zoom h-full w-full object-cover"
                />
              )}
            </div>
          </div>

          <div className="gamepadhomerecentgames_RecentGamesInnerContainer_gh relative pt-[54px]">
            {/* Steam renders this label but keeps it hidden while the
                carousel has focus (HeaderExit, opacity 0) — themes can
                reveal it */}
            <div className="gamepadhomerecentgames_RecentGamesHeader_gh h-[28px]">
              <span className="gamepadhomerecentgames_RecentGamesHeaderLabel_gh ml-[38px] text-[22px] font-bold leading-7 opacity-0">
                {t("recentGames")}
              </span>
            </div>

            {/* carousel: featured slot 564 (552 + 12 gap), portrait slots 184.
                pt/pb give the banner chips + focus ring/scale room so the
                horizontal-scroll container doesn't clip them at the top. */}
            <div
              ref={carousel}
              className="basicgamecarousel_BasicGameCarousel_gh no-scrollbar relative flex items-start overflow-x-auto overflow-y-hidden px-[38px] pb-2 pt-4"
            >
              {recent.map((rom, i) => {
                const platform = platformBySlug(rom.platform_slug);
                const isFocused = rom.id === focused?.id;
                const landscape = i === 0; // ONLY the first (most-recent) game is the wide hero
                const time = formatPlaytime(rom.playtime_seconds);
                return (
                  <CarouselSlot key={rom.id} landscape={landscape} focused={isFocused}>
                    <div className="basicgamecarousel_BasicGameCarouselItemMediaContainer_gh group relative">
                      <CapsuleGlow rom={rom} visible={isFocused} />
                      <Link
                        href={`/game/${rom.id}`}
                        data-rom-id={rom.id}
                        onFocus={(e) => {
                          setFocused(rom);
                          e.currentTarget.scrollIntoView({
                            behavior: "smooth",
                            inline: "center",
                            block: "nearest",
                          });
                        }}
                        onMouseEnter={() => setFocused(rom)}
                        className={`gamecapsule_GameCapsule_gh appportrait_LibraryItemBox_gh ${
                          landscape
                            ? "appportrait_Landscape_gh appportrait_FeaturedCapsule_gh"
                            : "appportrait_Portrait_gh"
                        } ${isFocused ? "appportrait_ShowAsHovered_gh" : ""} appportrait_InRecentGames_gh deck-shimmer relative block overflow-visible outline-none`}
                        title={rom.title}
                      >
                        <div
                          className={`libraryassetimage_Container_gh appportrait_PortraitImage_gh h-[258px] w-[calc(100%-12px)] overflow-hidden rounded-[3px] bg-[#0e141b] shadow-lg ring-white transition-[filter,box-shadow] duration-150 ${
                            isFocused ? "ring-2" : "[filter:brightness(0.9)]"
                          }`}
                        >
                          {landscape ? (
                            <FeaturedCapsule rom={rom} />
                          ) : (
                            <GameCover
                              title={rom.title}
                              boxartUrl={rom.boxart_url}
                              color={platform?.color}
                              shortName={platform?.shortName}
                              className="h-full w-full"
                            />
                          )}
                        </div>
                        {/* "New to library" banner chip (measured: 24px tall,
                            #1a9fff, overlapping the capsule's top edge) */}
                        {isNew(rom) && (
                          <span className="appportrait_AppPortraitBannerContainer_gh absolute -top-[2px] inset-x-0 flex justify-center">
                            <span className="appportrait_AppPortraitBanner_gh flex h-[24px] items-center bg-[#1a9fff] px-3 text-[10px] font-bold uppercase tracking-[0.5px] text-white">
                              {t("newToLibrary")}
                            </span>
                          </span>
                        )}
                      </Link>
                      {/* the featured (landscape) hero has a wide right margin;
                          nudge the cog in so it stays over the art */}
                      <GameCardCog romId={rom.id} className={landscape ? "right-3" : "right-4"} />
                    </div>
                    {/* label below the FOCUSED item (measured: 18px/800 title
                        + 12px/700 uppercase status). Sits in a reserved area so
                        the row height is stable as focus moves. */}
                    <div
                      className={`basicgamecarousel_CarouselGameLabelWrapper_gh gamecapsule_BottomBar_gh mt-[14px] h-[52px] transition-opacity duration-150 ${
                        isFocused ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <div className="basicgamecarousel_CarouselGameLabel_gh appportrait_PortraitMessage_gh">
                        <div className="appportrait_Message_gh marquee_Content_gh truncate text-[18px] font-extrabold leading-6 text-bright">
                          {rom.title}
                        </div>
                        <div className="appportrait_SubMessage_gh basicgamecarousel_SubMessage_gh mt-0.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.5px] text-dim">
                          <span className="basicgamecarousel_ActionIcon_gh basicgamecarousel_Play_gh text-[9px] text-[#59bf40]">
                            ▶
                          </span>
                          {time ? t("playtime", { time }) : t("neverPlayed")}
                        </div>
                      </div>
                    </div>
                  </CarouselSlot>
                );
              })}
              {/* trailing View More tile (measured: gray diagonal gradient) */}
              <div className="basicgamecarousel_BasicGameCarouselItem_gh w-[219px] shrink-0">
                <Link
                  href="/library"
                  className="basicgamecarousel_TextBoxCarouselContents_gh basicgamecarousel_BasicGameCarouselItemMediaContainer_gh deck-card flex h-[258px] w-[172px] items-center justify-center rounded-[3px] p-4 text-center text-[15px] font-semibold text-body"
                  style={{
                    backgroundImage:
                      "linear-gradient(313deg, rgba(51,51,51,0.667), rgba(85,85,85,0.667))",
                  }}
                >
                  {t("viewMoreLibrary")}
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Tabbed page: What's New · Friends · Recommended ---- */}
        <div className="gamepadtabbedpage_GamepadTabbedPage_gh relative -mt-[30px]">
          {/* sentinel: sits just above the tab row so we can detect when the row
              reaches the top and turn the header frosted (matches game details) */}
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />
          <div
            className={`gamepadtabbedpage_TabHeaderRowWrapper_gh sticky top-0 z-30 transition-[padding,background-color] duration-150 ${
              stuck ? "bg-black/50 pb-3 pt-[52px] backdrop-blur-[100px]" : ""
            }`}
          >
            <div className="gamepadtabbedpage_TabRow_gh flex items-center justify-center">
              <div className="gamepadtabbedpage_TabRowTabs_gh flex items-center gap-[2px]">
                {TABS.map((t) => (
                  <GpPill key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
                    {t.label}
                  </GpPill>
                ))}
              </div>
            </div>
          </div>

          <div className="gamepadtabbedpage_TabContents_gh">
            <div className="gamepadtabbedpage_TabContentsScroll_gh mx-[38px] pb-10 pt-6">
              {/* ---------- WHAT'S NEW: horizontal event cards (300px) ---------- */}
              {tab === "new" && (
                <div className="gamepadhomewhatsnew_LibraryHomeWhatsNew_gh">
                  <div className="gamepadhomewhatsnew_BasicHomeUpdates_gh">
                    {whatsNew.length === 0 && news.length === 0 ? (
                      <p className="py-10 text-center text-sm text-dim">{t("nothingNew")}</p>
                    ) : (
                      <>
                        {whatsNew.length > 0 && (
                          <section>
                            <h3 className="mb-3 text-[18px] font-bold text-bright">
                              {t("newToYourLibrary")}
                            </h3>
                            <div className="gamepadhomewhatsnew_EventCarousel_gh no-scrollbar flex gap-3 overflow-x-auto pb-1">
                        {whatsNew.map((rom) => {
                          const platform = platformBySlug(rom.platform_slug);
                          const art = rom.hero_url ?? rom.screenshot_url;
                          return (
                            <div key={rom.id} className="gamepadhomewhatsnew_OuterWrapper_gh w-[300px] shrink-0">
                              <div className="gamepadhomewhatsnew_EventType_gh mb-0 h-[22px] text-[12px] font-semibold uppercase text-dim">
                                {t("newToLibrary")}
                              </div>
                              <Link
                                href={`/game/${rom.id}`}
                                data-rom-id={rom.id}
                                className="gamepadhomewhatsnew_EventPreviewContainer_gh deck-card block"
                                title={rom.title}
                              >
                                <div className="gamepadhomewhatsnew_EventImageWrapper_gh relative h-[169px] w-[300px] overflow-hidden rounded-t-[3px] bg-black/40">
                                  {art ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={art}
                                      alt=""
                                      loading="lazy"
                                      className="gamepadhomewhatsnew_EventImage_gh h-full w-full object-cover"
                                    />
                                  ) : (
                                    <GameCover
                                      title={rom.title}
                                      boxartUrl={rom.boxart_url}
                                      color={platform?.color}
                                      shortName={platform?.shortName}
                                      className="h-full w-full"
                                    />
                                  )}
                                </div>
                                <div className="gamepadhomewhatsnew_EventInfo_gh h-[126px] rounded-b-[3px] bg-white/15 px-[10px] py-[10px]">
                                  <div className="partnereventdisplay_EventDetailTimeInfo_gh text-[12px] text-dim">
                                    {rom.added_at ? rom.added_at.slice(0, 10) : ""}
                                  </div>
                                  <div className="gamepadhomewhatsnew_Title_gh gamepadhomewhatsnew_MultilineClippedText_gh mt-1 line-clamp-2 text-[16px] font-semibold leading-[22px] text-bright">
                                    {t("joinedCollection", { title: rom.title })}
                                  </div>
                                  <div className="gamepadhomewhatsnew_GameIconAndName_gh mt-2 flex items-center gap-[5px]">
                                    <span className="gamepadhomewhatsnew_GameIcon_gh libraryassetimage_Container_gh h-[20px] w-[20px] shrink-0 overflow-hidden rounded-[2px] bg-[#0e141b]">
                                      <GameCover
                                        title={rom.title}
                                        boxartUrl={rom.boxart_url}
                                        color={platform?.color}
                                        className="h-full w-full"
                                      />
                                    </span>
                                    <span className="gamepadhomewhatsnew_GameName_gh truncate text-[14px] text-body">
                                      {platform?.name ?? rom.platform_slug}
                                    </span>
                                  </div>
                                </div>
                              </Link>
                            </div>
                          );
                        })}
                            </div>
                          </section>
                        )}
                        {news.map((section) => (
                          <NewsShelf
                            key={section.key}
                            section={section}
                            moreHref={section.key === "app" ? "/whats-new" : undefined}
                          />
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ---------- FRIENDS: date-grouped Activity feed ---------- */}
              {tab === "friends" && (
                <div>
                  <h2 className="mb-4 text-[22px] font-bold text-bright">{t("activity")}</h2>
                  {activityDays.length === 0 ? (
                    <p className="py-10 text-center text-sm text-dim">
                      {t("noActivity")}
                    </p>
                  ) : (
                    activityDays.map(({ day, items }) => (
                      <section key={day} className="mb-8">
                        <div className="appactivityday_AppActivityDate_gh border-b border-white/10 pb-1 text-[13px] font-semibold tracking-[0.15em] text-dim">
                          {day}
                        </div>
                        {items.map((a, i) => {
                          const platform = platformBySlug(a.rom.platform_slug);
                          const banner = a.rom.hero_url ?? a.rom.screenshot_url ?? a.rom.boxart_url;
                          return (
                            <div key={i} className="appactivityday_Event_gh mt-3">
                              <div className="appactivityday_EventHeadline_gh flex items-center gap-2 bg-white/5 px-3 py-2 text-[15px]">
                                {a.avatarUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={a.avatarUrl}
                                    alt=""
                                    className="steamavatar_avatarHolder_gh h-6 w-6 rounded-[2px] object-cover"
                                  />
                                ) : (
                                  <span className="steamavatar_avatarHolder_gh flex h-6 w-6 items-center justify-center rounded-[2px] bg-accent/25 text-xs font-black text-accent">
                                    {a.userName.slice(0, 1).toUpperCase()}
                                  </span>
                                )}
                                <span className="personanameandstatus_playerName_gh font-semibold text-bright">
                                  {a.userName}
                                </span>
                                <span className="text-dim">{t("played")}</span>
                                <Link
                                  href={`/game/${a.rom.id}`}
                                  className="truncate font-semibold text-body hover:text-bright"
                                >
                                  {a.rom.title}
                                </Link>
                              </div>
                              <Link
                                href={`/game/${a.rom.id}`}
                                data-rom-id={a.rom.id}
                                className="appactivityday_EventBody_gh appactivityday_ImageContainer_gh deck-card mt-1 flex items-center gap-4 bg-white/5 p-3"
                              >
                                <span className="block h-[64px] w-[140px] shrink-0 overflow-hidden rounded-[2px] bg-black/40">
                                  {banner ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={banner} alt="" loading="lazy" className="h-full w-full object-cover" />
                                  ) : (
                                    <GameCover
                                      title={a.rom.title}
                                      boxartUrl={a.rom.boxart_url}
                                      color={platform?.color}
                                      className="h-full w-full"
                                    />
                                  )}
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-[15px] font-semibold text-bright">
                                    {a.rom.title}
                                  </span>
                                  <span className="mt-0.5 block text-[12px] text-dim">
                                    {platform?.name ?? a.rom.platform_slug}
                                  </span>
                                </span>
                              </Link>
                            </div>
                          );
                        })}
                      </section>
                    ))
                  )}
                </div>
              )}

              {/* ---------- RECOMMENDED: curated shelves ---------- */}
              {tab === "recommended" && (
                <div>
                  {recommended.length === 0 ? (
                    <p className="py-10 text-center text-sm text-dim">
                      {t("nothingToRecommend")}
                    </p>
                  ) : (
                    recommended.map((shelf) => <RecommendedShelf key={shelf.key} shelf={shelf} />)
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
