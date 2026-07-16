import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getDb, getLibraryRom, gameVariants, friendsWhoPlayed, resolveRelatedLibrary, listRomRelations, customRelatedEditions, listUserScreenshots, reviewSummary, listReviews, getUserReview, compatSummary, getUserCompat, listGuides, getEmuPrefs, CollectionRow } from "@/lib/db";
import { platformBySlug, platformPlayable } from "@/lib/platforms";
import { formatBytes, formatPlaytime, timeAgo } from "@/lib/format";
import {
  RA_CONSOLE_IDS,
  raLookup,
  raProgress,
  RaProgress,
} from "@/lib/providers/retroachievements";
import { getRaCreds } from "@/lib/userRa";
import GameCover from "@/components/GameCover";
import GameTabs from "@/components/GameTabs";
import GameVariants from "@/components/GameVariants";
import GameOptionsModal from "@/components/GameOptionsModal";
import GameNotes from "@/components/GameNotes";
import GameRating from "@/components/GameRating";
import DetailsSection, { SectionBody, SectionHighlight } from "@/components/bpm/DetailsSection";
import ActivityComposer from "@/components/ActivityComposer";
import ActivityFeed, { ActivityEntry } from "@/components/ActivityFeed";
import { getRomActivity, activityImageUrl } from "@/lib/activity";
import { getSystemArt } from "@/lib/systemArt";
import PlayOptionsChevron from "@/components/PlayOptionsChevron";
import ControllerLayoutButton from "@/components/ControllerLayoutButton";
import AchievementCarousel from "@/components/AchievementCarousel";
import MediaGallery, { MediaItem } from "@/components/MediaGallery";
import RelatedContent from "@/components/RelatedContent";
import type { IgdbRelated, IgdbRelatedResolved } from "@/lib/providers/igdb";
import { formatHltb } from "@/lib/providers/hltb";
import { getRomHltb } from "@/lib/hltbCache";
import GameTheme from "@/components/GameTheme";
import ManualViewer from "@/components/ManualViewer";
import ManualButton from "@/components/ManualButton";
import SaveStatesPanel, { SaveStateInfo } from "@/components/SaveStatesPanel";
import ScreenshotGallery from "@/components/ScreenshotGallery";
import Reviews from "@/components/Reviews";
import Compatibility from "@/components/Compatibility";
import VideoFilterPicker from "@/components/VideoFilterPicker";
import CheatsManager from "@/components/CheatsManager";
import Guides from "@/components/Guides";

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const t = await getTranslations("gamePage");
  const { id } = await params;
  const rom = getLibraryRom(user.id, Number(id));
  if (!rom) notFound();

  // Other versions of this game on the same system (regional/hacks/translations)
  const variants = gameVariants(rom.id);

  // Friends' play history for this game (other users, most recent first) — read
  // from user_roms, not the activity feed.
  const friendPlays = friendsWhoPlayed(rom.id, user.id);

  const platform = platformBySlug(rom.platform_slug);
  const playtime = formatPlaytime(rom.playtime_seconds);

  // IGDB relational content (similar games, related editions, external links),
  // cross-referenced against the library (owned games link inward) with the
  // current game filtered out.
  // IGDB relational content merged with the user's custom relations, cross-
  // referenced against the library (owned games link inward), current game
  // filtered. Custom entries win on duplicates (their kind reflects user intent).
  const relationRows = listRomRelations(rom.id);
  const igdbRelated = (() => {
    const base: IgdbRelatedResolved = (() => {
      if (!rom.igdb_related) return { similar: [], editions: [], links: [] };
      try {
        return resolveRelatedLibrary(JSON.parse(rom.igdb_related) as IgdbRelated, rom.title);
      } catch {
        return { similar: [], editions: [], links: [] };
      }
    })();
    const seen = new Set<string>();
    const editions = [...customRelatedEditions(rom.id), ...base.editions].filter((e) => {
      const key = e.romId != null ? `id:${e.romId}` : `n:${e.name.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const merged: IgdbRelatedResolved = { similar: base.similar, editions, links: base.links };
    return merged.similar.length || merged.editions.length || merged.links.length ? merged : null;
  })();
  // Editors always get the RELATED tab (to add the first custom relation).
  const showRelatedTab = !!igdbRelated || user.isEditor;

  const collections = getDb()
    .prepare(
      `SELECT c.*,
              EXISTS(SELECT 1 FROM collection_items ci
                     WHERE ci.collection_id = c.id AND ci.rom_id = ?) AS has_rom
       FROM collections c WHERE c.user_id = ? AND c.is_smart = 0 ORDER BY c.name`
    )
    .all(rom.id, user.id) as (CollectionRow & { has_rom: number })[];

  const activity = getRomActivity(rom.id);

  // ---- RetroAchievements: match once (cached on the rom), then the viewer's
  // own unlock progress — pulled with their linked RA account (Settings →
  // account). Nothing shows unless this user has linked RetroAchievements.
  const raCreds = getRaCreds(user.id);
  let progress: RaProgress | null = null;
  if (raCreds && RA_CONSOLE_IDS[rom.platform_slug]) {
    if (rom.ra_game_id === null) {
      try {
        const match = await raLookup(raCreds, rom.title, rom.platform_slug);
        getDb()
          .prepare("UPDATE roms SET ra_game_id = ?, ra_achievements = ? WHERE id = ?")
          .run(match.id, match.achievements, rom.id);
        rom.ra_game_id = match.id;
        rom.ra_achievements = match.achievements;
      } catch {}
    }
    if (rom.ra_game_id) {
      try {
        progress = await raProgress(raCreds, rom.ra_game_id);
      } catch {}
    }
  }
  const raUrl = rom.ra_game_id ? `https://retroachievements.org/game/${rom.ra_game_id}` : null;

  // HowLongToBeat: looked up once, cached on the rom for 30 days (shared helper).
  const hltb = await getRomHltb(rom);
  const hltbRows: [string, string][] = [];
  if (hltb?.main != null) hltbRows.push([t("hltbMain"), formatHltb(hltb.main)]);
  if (hltb?.plus != null) hltbRows.push([t("hltbPlus"), formatHltb(hltb.plus)]);
  if (hltb?.completionist != null) hltbRows.push([t("hltbCompletionist"), formatHltb(hltb.completionist)]);

  // Fall back to the system's scraped art when the game has no hero of its own.
  const systemHero = getSystemArt(rom.platform_slug).hero;
  const heroBg = rom.hero_url ?? rom.screenshot_url ?? systemHero ?? rom.boxart_url;
  const heroIsWideArt = !!(rom.hero_url ?? rom.screenshot_url ?? systemHero);

  // A "fully scraped" game has a complete store page — description + art +
  // release info — which earns the green GAME INFO check (the Deck shows it
  // only when the page is complete). A bare scrape that returned little doesn't.
  const fullyScraped = !!(
    rom.scraped_at &&
    rom.description &&
    rom.boxart_url &&
    rom.release_date &&
    (rom.developer || rom.publisher)
  );

  const saveStates = getDb()
    .prepare(
      `SELECT id, size_bytes, has_screenshot, created_at, label FROM save_states
       WHERE user_id = ? AND rom_id = ? ORDER BY created_at DESC, id DESC`
    )
    .all(user.id, rom.id) as SaveStateInfo[];
  const batterySave = getDb()
    .prepare("SELECT size_bytes, updated_at FROM battery_saves WHERE user_id = ? AND rom_id = ?")
    .get(user.id, rom.id) as { size_bytes: number; updated_at: string } | undefined;
  const screenshots = listUserScreenshots(user.id, rom.id);
  const reviewsData = {
    summary: reviewSummary(rom.id),
    reviews: listReviews(rom.id),
    mine: getUserReview(user.id, rom.id) ?? null,
  };
  // Emulation compatibility only makes sense for playable (in-browser) systems.
  const compatData = platform?.ejsCore
    ? { summary: compatSummary(rom.id), mine: getUserCompat(user.id, rom.id) ?? null }
    : null;
  const emuShader = platform?.ejsCore ? getEmuPrefs(user.id, rom.id).shader : null;
  const guides = listGuides(rom.id);

  // Multi-disc siblings: same title/system/variant in the same folder
  let discs: { id: number; disc_number: number; size_bytes: number }[] = [];
  if (rom.disc_number !== null) {
    const sepIndex = Math.max(rom.path.lastIndexOf("\\"), rom.path.lastIndexOf("/"));
    const dirPrefix = rom.path.slice(0, sepIndex + 1);
    discs = getDb()
      .prepare(
        `SELECT id, disc_number, size_bytes FROM roms
         WHERE missing = 0 AND platform_slug = ? AND sort_title = ?
           AND COALESCE(variant, '') = COALESCE(?, '')
           AND disc_number IS NOT NULL AND path LIKE ?
         ORDER BY disc_number`
      )
      .all(rom.platform_slug, rom.sort_title, rom.variant, `${dirPrefix}%`) as {
      id: number;
      disc_number: number;
      size_bytes: number;
    }[];
  }

  // ---------------- ACTIVITY: date-grouped feed ----------------
  const feedEntries: ActivityEntry[] = [
    ...activity.map((a) => ({
      id: a.id,
      type: a.type,
      summary: a.summary,
      detail: a.detail,
      image: activityImageUrl(a),
      created_at: a.created_at,
      canDelete: a.type === "comment" && a.user_id === user.id,
      actorId: a.user_id,
      actorName: a.actor_name ?? t("actorSomeone"),
      actorAvatar: a.actor_avatar,
    })),
    // Synthesized baseline: the library scan adds games globally (no per-user
    // creator), so it's attributed to the Library rather than a person.
    {
      id: -1,
      type: "added",
      summary: t("addedActivity", { title: rom.title }),
      detail: t("joinedLibrary", {
        system: platform?.name ?? rom.platform_slug,
        variant: rom.variant ? ` (${rom.variant})` : "",
      }),
      image: activity.length === 0 ? (rom.hero_url ?? rom.screenshot_url) : null,
      created_at: rom.added_at,
      canDelete: false,
      actorId: 0,
      actorName: t("actorLibrary"),
      actorAvatar: null,
    },
  ];

  const activityTab = (
    <div className="flex flex-col gap-6">
      <ActivityComposer romId={rom.id} />
      <ActivityFeed entries={feedEntries} />
    </div>
  );

  // ---------------- YOUR STUFF: achievements + media + your settings ----------------
  // Steam-style achievements: unlocked first, full-color; locked desaturated.
  const sortedAchievements = progress
    ? [...progress.achievements].sort((a, b) => Number(b.earned) - Number(a.earned))
    : [];
  const pct = progress ? Math.round((progress.earned / Math.max(1, progress.total)) * 100) : 0;

  const yourStuffTab = (
    <div className="flex flex-col gap-5">
      {progress && (
        <DetailsSection
          title={t("achievements")}
          headerRight={
            raUrl && (
              <a href={raUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                {t("viewOnRa")}
              </a>
            )
          }
          bodyless
        >
          {/* Deck: a lifted Highlight row carries the unlock progress */}
          <SectionHighlight>
            <span className="appdetailsachievementssection_UnlockedLabel_gh shrink-0 text-[16px] text-[#cccccc]">
              {t("unlockedProgress", { earned: progress.earned, total: progress.total, pct })}
            </span>
            <div className="appdetailsachievementssection_AchievementProgressContainer_gh h-2 flex-1 overflow-hidden rounded-[3px] bg-white/[0.24]">
              <div
                className="appdetailsachievementssection_AchievementProgress_gh h-full rounded-[3px] bg-[#59bf40]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </SectionHighlight>

          <SectionBody>
            <h3 className="appdetailsachievementssection_LockedAchievementsLabel_gh mb-3 text-[12px] font-bold uppercase tracking-[0.5px] text-[#b8bcbf]">
              {progress.earned < progress.total ? t("achievements") : t("allUnlocked")}
            </h3>
            <AchievementCarousel
              raUrl={raUrl}
              achievements={sortedAchievements.map((a) => ({
                badgeUrl: a.badgeUrl,
                title: a.title,
                description: a.description,
                points: a.points,
                earned: a.earned,
              }))}
            />
          </SectionBody>
        </DetailsSection>
      )}

      {compatData && (
        <DetailsSection title={t("compatSection")}>
          <Compatibility romId={rom.id} isAdmin={user.isAdmin} initial={compatData} />
        </DetailsSection>
      )}

      {platform?.ejsCore && (
        <DetailsSection title={t("videoSection")}>
          <VideoFilterPicker romId={rom.id} initialShader={emuShader} />
        </DetailsSection>
      )}

      {platform?.ejsCore && (
        <DetailsSection title={t("cheatsSection")}>
          <CheatsManager romId={rom.id} />
        </DetailsSection>
      )}

      {platform?.ejsCore && (
        <DetailsSection title={t("savesAndStates")}>
          <SaveStatesPanel
            romId={rom.id}
            playable={!!platform?.ejsCore}
            initialStates={saveStates}
            batterySave={batterySave ?? null}
            gameImage={rom.screenshot_url ?? rom.boxart_url ?? rom.hero_url ?? null}
          />
        </DetailsSection>
      )}

      {platform?.ejsCore && screenshots.length > 0 && (
        <DetailsSection title={t("screenshotsSection")} bodyless>
          <div className="p-[10px]">
            <ScreenshotGallery romId={rom.id} shots={screenshots} canDelete showHeading={false} />
          </div>
        </DetailsSection>
      )}

      {(rom.video_url || rom.trailer_url || rom.screenshot_url) && (
        <DetailsSection title={t("media")} containerClassName="appdetailsscreenshotssection_ScreenshotsSection_gh" bodyless>
          <MediaGallery
            title={rom.title}
            romId={rom.id}
            canManage={user.isEditor}
            items={[
              ...(rom.video_url
                ? [{ kind: "video", url: rom.video_url, poster: rom.screenshot_url ?? rom.hero_url } as MediaItem]
                : []),
              ...(rom.trailer_url
                ? [{ kind: "youtube", url: rom.trailer_url } as MediaItem]
                : []),
              ...(rom.screenshot_url
                ? [{ kind: "image", url: rom.screenshot_url } as MediaItem]
                : []),
            ]}
          />
        </DetailsSection>
      )}

      <DetailsSection title={t("notes")}>
        <GameNotes romId={rom.id} initial={rom.notes} />
      </DetailsSection>

      <DetailsSection title={t("yourRating")}>
        <GameRating
          romId={rom.id}
          initial={{
            rating: rom.user_rating,
            difficulty: rom.difficulty,
            completion: rom.completion,
          }}
        />
      </DetailsSection>
    </div>
  );

  // ---------------- GAME INFO: boxart + description + features + links ----------------
  const gameInfoTab = (
    <div>
      <div className="flex flex-col gap-8 md:flex-row">
        <GameCover
          title={rom.title}
          boxartUrl={rom.boxart_url}
          color={platform?.color}
          shortName={platform?.shortName}
          className="h-60 w-44 shrink-0 rounded shadow-2xl"
        />
        <div className="min-w-0 flex-1">
          <p className="max-w-3xl whitespace-pre-line text-[15px] leading-relaxed text-body">
            {rom.description ?? t("noDescription")}
          </p>
          <dl className="mt-6 space-y-1 text-sm">
            {rom.developer && (
              <div>
                <dt className="inline text-dim">{t("developerLabel")}</dt>
                <dd className="inline font-semibold text-body">{rom.developer}</dd>
              </div>
            )}
            {rom.publisher && (
              <div>
                <dt className="inline text-dim">{t("publisherLabel")}</dt>
                <dd className="inline font-semibold text-body">{rom.publisher}</dd>
              </div>
            )}
            {rom.release_date && (
              <div>
                <dt className="inline text-dim">{t("releaseDateLabel")}</dt>
                <dd className="inline font-semibold text-body">{rom.release_date}</dd>
              </div>
            )}
            {rom.genre && (
              <div>
                <dt className="inline text-dim">{t("genreLabel")}</dt>
                <dd className="inline font-semibold text-body">{rom.genre}</dd>
              </div>
            )}
            {rom.franchise && (
              <div>
                <dt className="inline text-dim">{t("franchiseLabel")}</dt>
                <dd className="inline font-semibold text-body">{rom.franchise}</dd>
              </div>
            )}
            {rom.game_modes && (
              <div>
                <dt className="inline text-dim">{t("modesLabel")}</dt>
                <dd className="inline font-semibold text-body">{rom.game_modes}</dd>
              </div>
            )}
            {rom.themes && (
              <div>
                <dt className="inline text-dim">{t("themesLabel")}</dt>
                <dd className="inline font-semibold text-body">{rom.themes}</dd>
              </div>
            )}
            {rom.age_rating && (
              <div className="flex items-center gap-2 pt-1">
                {rom.rating_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={rom.rating_image_url}
                    alt={rom.age_rating}
                    className="h-8 w-auto"
                  />
                ) : (
                  <>
                    <dt className="inline text-dim">{t("ratingLabel")}</dt>
                    <dd className="inline font-semibold text-body">{rom.age_rating}</dd>
                  </>
                )}
              </div>
            )}
          </dl>

          {hltbRows.length > 0 && (
            <div className="mt-7">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-dim">
                <span className="text-accent">⌛</span> {t("howLongToBeat")}
              </div>
              <div className="flex flex-wrap gap-2.5">
                {hltbRows.map(([label, value]) => (
                  <div
                    key={label}
                    className="min-w-[104px] flex-1 rounded-[3px] bg-white/[0.06] px-4 py-2.5 text-center sm:flex-none"
                  >
                    <div className="text-[19px] font-bold leading-tight text-bright">{value}</div>
                    <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-dim">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 text-[11px] text-dim/70">{t("hltbSource")}</div>
            </div>
          )}
        </div>
        <div className="w-full shrink-0 space-y-3 text-sm text-dim md:w-60">
          {platform?.ejsCore && (
            <div className="flex items-center gap-2.5">
              <span className="text-accent">✦</span> {t("playableInBrowser")}
            </div>
          )}
          {platform?.ejsCore && (
            <div className="flex items-center gap-2.5">
              <span className="text-accent">☁</span> {t("browserSaveStates")}
            </div>
          )}
          {rom.ra_game_id ? (
            <div className="flex items-center gap-2.5">
              <span className="text-accent">🏆</span>
              {t("raCount", { count: rom.ra_achievements ?? 0 })}
            </div>
          ) : null}
          {rom.players && (
            <div className="flex items-center gap-2.5">
              <span className="text-accent">👥</span> {t("playersCount", { players: rom.players })}
            </div>
          )}
          {rom.rating && (
            <div className="flex items-center gap-2.5">
              <span className="text-accent">★</span> {t("ratedValue", { rating: rom.rating })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <a
          href={`/api/roms/${rom.id}/file?download=1`}
          className="rounded bg-[#2a3540] px-6 py-3 text-sm font-semibold text-body transition-colors hover:bg-[#37434f] hover:text-bright"
        >
          {t("downloadRom")}
        </a>
        {rom.manual_url && <ManualButton />}
        <Link
          href={`/systems/${rom.platform_slug}`}
          className="rounded bg-[#2a3540] px-6 py-3 text-sm font-semibold text-body transition-colors hover:bg-[#37434f] hover:text-bright"
        >
          {t("systemLibrary", { name: platform?.shortName ?? rom.platform_slug })}
        </Link>
        {raUrl && (
          <a
            href={raUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded bg-[#2a3540] px-6 py-3 text-sm font-semibold text-body transition-colors hover:bg-[#37434f] hover:text-bright"
          >
            RetroAchievements
          </a>
        )}
        {user.isEditor && (
          <Link
            href={`/game/${rom.id}/properties`}
            className="rounded bg-[#2a3540] px-6 py-3 text-sm font-semibold text-body transition-colors hover:bg-[#37434f] hover:text-bright"
          >
            {t("properties")}
          </Link>
        )}
      </div>

      <div className="panel mt-8 p-6">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-bright">
          {t("fileDetails")}
        </h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-dim">{t("filename")}</dt>
          <dd className="break-all text-body">{rom.filename}</dd>
          <dt className="text-dim">{t("path")}</dt>
          <dd className="break-all text-body">{rom.path}</dd>
          <dt className="text-dim">{t("system")}</dt>
          <dd className="text-body">
            {platform?.name ?? rom.platform_slug}
            {rom.variant && <span className="ml-2 text-accent">({rom.variant})</span>}
          </dd>
          <dt className="text-dim">{t("size")}</dt>
          <dd className="text-body">{formatBytes(rom.size_bytes)}</dd>
          <dt className="text-dim">{t("added")}</dt>
          <dd className="text-body">{rom.added_at.slice(0, 10)}</dd>
          {rom.scraped_at && (
            <>
              <dt className="text-dim">{t("scraped")}</dt>
              <dd className="text-body">
                {rom.scraped_at.slice(0, 10)} ({rom.metadata_source})
              </dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );

  return (
    <main
      className="appdetailsoverview_Container_gh -mt-10 pb-8"
      style={{
        // game-page surface measured from BPM: lifted gray with a soft
        // radial highlight up-left of center
        backgroundColor: "#24282f",
        backgroundImage: "radial-gradient(100% 100% at 45% 35%, #2c323d 0%, #24282f 100%)",
      }}
    >
      <GameTheme romId={rom.id} themeUrl={rom.theme_url} />
      {/* Full-bleed hero — measured on the Deck (sharedappdetailsheader): a
          blurred fill layer, the sharp wide art on top, and the game LOGO
          centered over it (title text only when there's no logo), ≈47vh. */}
      <div className="sharedappdetailsheader_ImgContainer_gh relative h-[46vh] min-h-[300px] w-full overflow-hidden">
        {heroBg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroBg}
            alt=""
            aria-hidden
            className="sharedappdetailsheader_ImgSrc_gh absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.7]"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(115deg, #14181f 25%, ${platform?.color ?? "#2a475e"}55 100%)`,
            }}
          />
        )}
        {heroIsWideArt && heroBg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroBg}
            alt=""
            aria-hidden
            className="sharedappdetailsheader_ImgSrc_gh absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* scrims: top black fade + bottom fade into the page surface */}
        <div className="absolute inset-x-0 top-0 h-[75px] bg-gradient-to-b from-black/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#24282f]/85 to-transparent" />
        {/* centered logo (or title fallback) + subtle platform caption */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
          {rom.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={rom.logo_url}
              alt={rom.title}
              className="sharedappdetailsheader_TitleLogo_gh max-h-[60%] max-w-[46%] object-contain drop-shadow-[0_2px_12px_rgba(0,0,0,0.65)]"
            />
          ) : (
            <h1 className="appdetailsgameinfopanel_Name_gh max-w-3xl text-4xl font-black text-bright drop-shadow-lg md:text-5xl">
              {rom.title}
            </h1>
          )}
          {/* platform caption only for UNSCRAPED games (a scraped game's logo
              is enough — its system lives in Game Info, like the Deck) */}
          {!rom.scraped_at && (
            <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.25em] text-white/70 drop-shadow">
              <span>{platform?.name ?? rom.platform_slug}</span>
              {rom.variant && (
                <span className="rounded bg-white/15 px-2 py-0.5 text-white">{rom.variant}</span>
              )}
              {rom.region && <span className="text-white/50">{rom.region}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Play bar — Deck geometry (appdetailsplaysection): 24px gutter, 48px
          row. Split Play button = 210px main (green ▶ + white "Play" on a
          white/.17 field) + 24px dropdown chevron; stacked stat blocks (12/700
          labels, 16/500 values); two 48px icon buttons; a centered status line
          below (the Deck's CloudStatusRow analog). */}
      <div className="appdetailsplaysection_PlayBar_gh px-6 pt-4">
        <div className="flex h-12 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-6">
            {platform && platformPlayable(platform) ? (
              <div className="appactionbutton_PlayButtonContainer_gh flex h-12 w-[234px] shrink-0 items-center overflow-hidden rounded-[2px] bg-[#dcdedf]/[0.17]">
                {/* Plain <a>, not <Link>: launching must be a full-page load so
                    EmulatorJS starts in a fresh document (it can't cleanly
                    re-init on a client-side SPA re-entry). */}
                <a
                  href={`/play/${rom.id}`}
                  className="appactionbutton_ButtonChild_gh flex h-full flex-1 items-center gap-3 px-4 text-[16px] font-medium text-white transition-colors hover:bg-white/10"
                >
                  <span className="text-[13px] text-[#59bf40]">▶</span>
                  <span className="appactionbutton_ButtonText_gh">{t("play")}</span>
                </a>
                <PlayOptionsChevron />
              </div>
            ) : (
              <span className="appactionbutton_ButtonChild_gh flex h-12 shrink-0 cursor-default items-center rounded-[2px] bg-[#dcdedf]/[0.17] px-4 text-[16px] font-medium text-body">
                <span className="appactionbutton_ButtonText_gh">{t("notPlayableInBrowser")}</span>
              </span>
            )}
            <div className="flex items-center gap-6">
              <div>
                <div className="appdetailsplaysection_PlayBarLabel_gh text-[12px] font-bold uppercase tracking-[0.5px] text-white/70">
                  {t("lastPlayed")}
                </div>
                <div className="appdetailsplaysection_PlayBarDetailLabel_gh text-[16px] font-medium text-white">
                  {rom.last_played_at ? rom.last_played_at.slice(0, 10) : t("never")}
                </div>
              </div>
              <div>
                <div className="appdetailsplaysection_PlayBarLabel_gh text-[12px] font-bold uppercase tracking-[0.5px] text-white/70">
                  {t("playTime")}
                </div>
                <div className="appdetailsplaysection_PlayBarDetailLabel_gh text-[16px] font-medium text-white">{playtime || "—"}</div>
              </div>
              {progress && (
                <div>
                  <div className="appdetailsplaysection_PlayBarLabel_gh text-[12px] font-bold uppercase tracking-[0.5px] text-white/70">
                    {t("achievements")}
                  </div>
                  <div className="appdetailsplaysection_PlayBarDetailLabel_gh text-[16px] font-medium text-white">
                    {progress.earned}/{progress.total}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-[10px]">
          {platform && platformPlayable(platform) && (
            <ControllerLayoutButton romId={rom.id} title={rom.title} />
          )}
          <GameOptionsModal
            romId={rom.id}
            title={rom.title}
            favorite={rom.favorite === 1}
            isAdmin={user.isEditor}
            hidden={rom.hidden === 1}
            filename={rom.filename}
            hasManual={!!rom.manual_url}
            collections={collections.map((c) => ({
              id: c.id,
              name: c.name,
              hasRom: c.has_rom === 1,
            }))}
          />
          </div>
        </div>

        {/* Manual viewer: mounted here (outside the tabs) so "Read Manual" from
            the options menu — and the Game Info button — works from any tab. */}
        {rom.manual_url && (
          <ManualViewer url={rom.manual_url} title={rom.title} trigger={false} />
        )}

        {/* centered status line — GameHub's analog of the Deck's Steam Cloud
            row, with a thin rule flanking the label on either side */}
        <div className="appdetailsplaysection_CloudStatusRow_gh -mx-6 mt-2 flex items-center gap-4 py-1">
          <span className="h-px flex-1 bg-white/15" aria-hidden />
          <div className="flex items-center gap-2 whitespace-nowrap text-[12px] font-bold uppercase tracking-[0.5px] text-white/70">
            {platform && platformPlayable(platform) ? (
              <>
                <span className="text-[#59bf40]">✔</span>
                <span className="appdetailsplaysection_CloudStatusLabel_gh">
                  {saveStates.length > 0
                    ? t("saveStatesInBrowser", { count: saveStates.length })
                    : t("readyToPlay")}
                </span>
              </>
            ) : (
              <span className="appdetailsplaysection_CloudStatusLabel_gh">
                {t("downloadToPlay", { system: platform?.name ?? rom.platform_slug })}
              </span>
            )}
          </div>
          <span className="h-px flex-1 bg-white/15" aria-hidden />
        </div>
      </div>

      {/* Friends who've played — pulled from play history (user_roms), most
          recently played first. Hidden when no one else has played it. */}
      {friendPlays.length > 0 && (
        <div className="px-6 pt-3">
          <div className="flex items-center gap-3 overflow-x-auto rounded-[3px] bg-[#0f1319]/60 px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.2em] text-white/55">
              {t("friendsWhoPlayed")}
            </span>
            <div className="flex items-center gap-2">
              {friendPlays.map((f) => (
                <Link
                  key={f.user_id}
                  href={`/profile/${f.user_id}`}
                  className="flex shrink-0 items-center gap-2 rounded-full bg-white/[0.06] py-1 pl-1 pr-3 transition-colors hover:bg-white/10"
                  title={formatPlaytime(f.playtime_seconds) ? t("friendPlaytimeTitle", { name: f.name, time: formatPlaytime(f.playtime_seconds) }) : f.name}
                >
                  {f.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/25 text-[11px] font-bold text-accent">
                      {f.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="text-[13px] font-medium text-body">{f.name}</span>
                  <span className="text-[12px] text-dim" suppressHydrationWarning>
                    {timeAgo(f.last_played_at)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Multi-disc strip */}
      {discs.length > 1 && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-black/40 bg-[#0f1319] px-10 py-3">
          <span className="text-sm text-dim">💿 {t("discGameCount", { count: discs.length })}</span>
          <a
            href={`/api/roms/${rom.id}/discs`}
            className="rounded bg-white/5 px-3 py-1.5 text-sm font-semibold text-body transition-colors hover:bg-white/10 hover:text-bright"
            title={t("allDiscsZipTitle")}
          >
            ⇩ {t("allDiscsZip")}
          </a>
          {discs.map((d) => (
            <a
              key={d.id}
              href={
                d.id === rom.id
                  ? `/game/${d.id}`
                  : platform?.ejsCore
                    ? `/play/${d.id}`
                    : `/game/${d.id}`
              }
              className={`rounded px-4 py-1.5 text-sm font-semibold transition-colors ${
                d.id === rom.id
                  ? "bg-accent/25 text-accent"
                  : "bg-white/5 text-body hover:bg-white/10 hover:text-bright"
              }`}
              title={formatBytes(d.size_bytes)}
            >
              {d.id === rom.id ? "" : platform?.ejsCore ? "▶ " : ""}{t("discNumber", { number: d.disc_number })}
            </a>
          ))}
        </div>
      )}

      <GameTabs
        tabs={[
          { key: "activity", label: t("tabActivity"), content: activityTab },
          { key: "stuff", label: t("tabYourStuff"), content: yourStuffTab },
          // Only when this game has other versions on the system.
          ...(variants.length
            ? [
                {
                  key: "variants",
                  label: t("tabVariants"),
                  content: (
                    <GameVariants variants={variants} platformSlug={rom.platform_slug} />
                  ),
                },
              ]
            : []),
          // IGDB + custom related content; editors always see the tab to curate.
          ...(showRelatedTab
            ? [
                {
                  key: "related",
                  label: t("tabRelated"),
                  content: (
                    <RelatedContent
                      related={igdbRelated ?? { similar: [], editions: [], links: [] }}
                      romId={rom.id}
                      canManage={user.isEditor}
                      relations={relationRows}
                    />
                  ),
                },
              ]
            : []),
          {
            key: "guides",
            label: t("tabGuides"),
            content: <Guides romId={rom.id} currentUserId={user.id} isAdmin={user.isAdmin} initial={guides} />,
            badge:
              guides.length > 0 ? (
                <span
                  key="guides-count"
                  className="rounded-full bg-white/10 px-1.5 text-[10px] font-bold text-body"
                >
                  {guides.length}
                </span>
              ) : undefined,
          },
          {
            key: "reviews",
            label: t("tabReviews"),
            content: <Reviews romId={rom.id} currentUserId={user.id} initial={reviewsData} />,
            badge:
              reviewsData.summary.pct !== null ? (
                <span
                  key="review-pct"
                  className="rounded-full bg-white/10 px-1.5 text-[10px] font-bold text-body"
                >
                  {reviewsData.summary.pct}%
                </span>
              ) : undefined,
          },
          {
            key: "info",
            label: t("tabGameInfo"),
            content: gameInfoTab,
            // green ✓ badge only when the store page is COMPLETE (Deck shows
            // this on GAME INFO once fully scraped) — not for a bare scrape
            badge: fullyScraped ? (
              // keyed: it's rendered beside the label in a child array, so
              // without a key React warns "unique key prop"
              <span
                key="scraped-badge"
                className="flex h-[15px] w-[15px] items-center justify-center rounded-full bg-[#59bf40] text-[9px] font-black text-[#0e141b]"
              >
                ✓
              </span>
            ) : undefined,
          },
        ]}
      />
    </main>
  );
}
