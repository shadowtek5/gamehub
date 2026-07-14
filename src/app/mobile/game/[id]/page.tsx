import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getDb, getLibraryRom, gameVariants, friendsWhoPlayed, resolveRelatedLibrary, listRomRelations, customRelatedEditions, CollectionRow } from "@/lib/db";
import { platformBySlug, platformPlayable } from "@/lib/platforms";
import { formatBytes, formatPlaytime, timeAgo } from "@/lib/format";
import { formatHltb } from "@/lib/providers/hltb";
import { getRomHltb } from "@/lib/hltbCache";
import { LANGUAGE_NAMES } from "@/lib/language";
import GameCover from "@/components/GameCover";
import GameVariants from "@/components/GameVariants";
import GameNotes from "@/components/GameNotes";
import GameRating from "@/components/GameRating";
import MediaGallery, { MediaItem } from "@/components/MediaGallery";
import ManualViewer from "@/components/ManualViewer";
import MobileGameOptions from "@/components/mobile/MobileGameOptions";
import RelatedContent from "@/components/RelatedContent";
import SaveStatesPanel, { SaveStateInfo } from "@/components/SaveStatesPanel";
import AchievementCarousel from "@/components/AchievementCarousel";
import ControllerLayoutButton from "@/components/ControllerLayoutButton";
import { RA_CONSOLE_IDS, raLookup, raProgress, RaProgress } from "@/lib/providers/retroachievements";
import { getRaCreds } from "@/lib/userRa";
import type { IgdbRelated, IgdbRelatedResolved } from "@/lib/providers/igdb";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-dim">{title}</h2>
      {children}
    </section>
  );
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 py-2 text-[14px] last:border-0">
      <span className="text-dim">{label}</span>
      <span className="min-w-0 truncate text-right text-body">{value}</span>
    </div>
  );
}

export default async function MobileGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const t = await getTranslations("mobileGamePage.detail");
  const tg = await getTranslations("gamePage"); // reuse the desktop game-page labels
  const { id } = await params;
  const rom = getLibraryRom(user.id, Number(id));
  if (!rom) notFound();

  const platform = platformBySlug(rom.platform_slug);
  const playable = !!platform && platformPlayable(platform);
  const hero = rom.hero_url || rom.screenshot_url || null;
  const variants = gameVariants(rom.id);
  const friendPlays = friendsWhoPlayed(rom.id, user.id);

  const languages = (rom.language ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((l) => LANGUAGE_NAMES[l] ?? l)
    .join(", ");

  // HowLongToBeat completion times (30-day cache on the rom, shared helper).
  const hltb = await getRomHltb(rom);
  const hltbRows: [string, string][] = [];
  if (hltb?.main != null) hltbRows.push([t("hltbMain"), formatHltb(hltb.main)]);
  if (hltb?.plus != null) hltbRows.push([t("hltbPlus"), formatHltb(hltb.plus)]);
  if (hltb?.completionist != null) hltbRows.push([t("hltbCompletionist"), formatHltb(hltb.completionist)]);

  const mediaItems: MediaItem[] = [
    ...(rom.video_url
      ? [{ kind: "video", url: rom.video_url, poster: rom.screenshot_url ?? rom.hero_url } as MediaItem]
      : []),
    ...(rom.trailer_url ? [{ kind: "youtube", url: rom.trailer_url } as MediaItem] : []),
    ...(rom.screenshot_url ? [{ kind: "image", url: rom.screenshot_url } as MediaItem] : []),
  ];

  // IGDB relational content merged with the user's custom relations (see the
  // desktop game page for the full rationale).
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
  const showRelated = !!igdbRelated || user.isEditor;

  const collections = getDb()
    .prepare(
      `SELECT c.*, EXISTS(SELECT 1 FROM collection_items ci
              WHERE ci.collection_id = c.id AND ci.rom_id = ?) AS has_rom
       FROM collections c WHERE c.user_id = ? AND c.is_smart = 0 ORDER BY c.name`
    )
    .all(rom.id, user.id) as (CollectionRow & { has_rom: number })[];

  // RetroAchievements: the viewer's own unlock progress (only shows if they've
  // linked an RA account). Same match-once-then-progress flow as the desktop.
  const raCreds = getRaCreds(user.id);
  let progress: RaProgress | null = null;
  if (raCreds && RA_CONSOLE_IDS[rom.platform_slug]) {
    if (rom.ra_game_id === null) {
      try {
        const match = await raLookup(raCreds, rom.title, rom.platform_slug);
        getDb().prepare("UPDATE roms SET ra_game_id = ?, ra_achievements = ? WHERE id = ?").run(match.id, match.achievements, rom.id);
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
  const sortedAchievements = progress
    ? [...progress.achievements].sort((a, b) => Number(b.earned) - Number(a.earned))
    : [];
  const raPct = progress ? Math.round((progress.earned / Math.max(1, progress.total)) * 100) : 0;

  // Cloud save states + battery save for this user/game.
  const saveStates = getDb()
    .prepare(
      `SELECT id, size_bytes, has_screenshot, created_at, label FROM save_states
       WHERE user_id = ? AND rom_id = ? ORDER BY created_at DESC, id DESC`
    )
    .all(user.id, rom.id) as SaveStateInfo[];
  const batterySave = getDb()
    .prepare("SELECT size_bytes, updated_at FROM battery_saves WHERE user_id = ? AND rom_id = ?")
    .get(user.id, rom.id) as { size_bytes: number; updated_at: string } | undefined;

  return (
    <div className="-mx-4">
      {/* Hero */}
      <div className="relative h-44 w-full overflow-hidden bg-[#12161c]">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full" style={{ background: `linear-gradient(120deg, #12161c 30%, ${platform?.color ?? "#1a9fff"}55)` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/40 to-transparent" />
        <Link href="/mobile/library" className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur active:bg-black/70" aria-label={t("back")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
      </div>

      <div className="px-4">
        <div className="mt-4 flex items-center gap-3">
          <div className="h-32 w-[92px] shrink-0 overflow-hidden rounded-[6px] bg-[#0e1218] shadow-lg ring-1 ring-white/10">
            <GameCover title={rom.title} boxartUrl={rom.boxart_url} color={platform?.color} shortName={platform?.shortName} className="h-full w-full" fit="contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[19px] font-black leading-tight text-bright">{rom.title}</h1>
            <div className="mt-0.5 text-[13px] text-dim">{platform?.name ?? rom.platform_slug}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2">
          {playable ? (
            <Link href={`/mobile/play/${rom.id}`} className="flex flex-1 items-center justify-center gap-2 rounded-[8px] bg-[#59bf40] py-3 text-[15px] font-bold text-black active:opacity-90">
              ▶ {t("play")}
            </Link>
          ) : (
            <span className="flex flex-1 items-center justify-center rounded-[8px] bg-[#1a1f27] py-3 text-[14px] font-semibold text-dim ring-1 ring-white/10">
              {t("downloadToPlay")}
            </span>
          )}
          <MobileGameOptions
            romId={rom.id}
            title={rom.title}
            favorite={rom.favorite === 1}
            hidden={rom.hidden === 1}
            isAdmin={user.isEditor}
            hasManual={!!rom.manual_url}
            collections={collections.map((c) => ({ id: c.id, name: c.name, hasRom: c.has_rom === 1 }))}
          />
        </div>

        {/* Quick stats strip */}
        <div className="mt-5 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            [t("statPlayTime"), formatPlaytime(rom.playtime_seconds) || "—"],
            [t("statLastPlayed"), rom.last_played_at ? rom.last_played_at.slice(0, 10) : t("never")],
            [t("statSize"), formatBytes(rom.size_bytes)],
            ...(rom.rating ? [[t("statRating"), rom.rating]] : []),
          ].map(([l, v]) => (
            <div key={l} className="shrink-0 rounded-[8px] bg-[#1a1f27] px-3 py-2 ring-1 ring-white/5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-dim">{l}</div>
              <div className="text-[13px] text-body">{v}</div>
            </div>
          ))}
        </div>

        {hltbRows.length > 0 && (
          <Section title={t("sectionHltb")}>
            <div className="flex gap-2">
              {hltbRows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex-1 rounded-[8px] bg-[#1a1f27] px-3 py-2 text-center ring-1 ring-white/5"
                >
                  <div className="text-[15px] font-bold text-body">{value}</div>
                  <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-dim">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {friendPlays.length > 0 && (
          <Section title={t("sectionFriends")}>
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {friendPlays.map((f) => (
                <Link
                  key={f.user_id}
                  href={`/mobile/profile/${f.user_id}`}
                  className="flex shrink-0 items-center gap-2 rounded-full bg-[#1a1f27] py-1 pl-1 pr-3 ring-1 ring-white/5 active:bg-[#232a34]"
                >
                  {f.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/25 text-[12px] font-bold text-accent">
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
          </Section>
        )}

        {rom.description && (
          <Section title={t("sectionAbout")}>
            <p className="whitespace-pre-line text-[14px] leading-relaxed text-body">{rom.description}</p>
          </Section>
        )}

        {progress && (
          <Section title={progress.earned < progress.total ? tg("achievements") : tg("allUnlocked")}>
            <div className="mb-2 text-[12px] text-dim">
              {tg("unlockedProgress", { earned: progress.earned, total: progress.total, pct: raPct })}
            </div>
            <div className="mb-3 h-2 overflow-hidden rounded bg-white/[0.15]">
              <div className="h-full rounded bg-[#59bf40]" style={{ width: `${raPct}%` }} />
            </div>
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
          </Section>
        )}

        {mediaItems.length > 0 && (
          <Section title={t("sectionMedia")}>
            <MediaGallery title={rom.title} romId={rom.id} canManage={user.isEditor} items={mediaItems} />
          </Section>
        )}

        {showRelated && (
          <Section title={t("sectionRelated")}>
            <RelatedContent
              related={igdbRelated ?? { similar: [], editions: [], links: [] }}
              romId={rom.id}
              canManage={user.isEditor}
              relations={relationRows}
            />
          </Section>
        )}

        {(playable || saveStates.length > 0 || batterySave) && (
          <Section title={tg("savesAndStates")}>
            <SaveStatesPanel
              romId={rom.id}
              playable={playable}
              initialStates={saveStates}
              batterySave={batterySave ?? null}
              gameImage={rom.screenshot_url ?? rom.boxart_url ?? rom.hero_url ?? null}
            />
          </Section>
        )}

        {playable && (
          <div className="mt-6">
            <ControllerLayoutButton romId={rom.id} title={rom.title} />
          </div>
        )}

        <Section title={t("sectionDetails")}>
          <div className="rounded-[8px] bg-[#1a1f27] px-4 py-1 ring-1 ring-white/5">
            <Meta label={t("metaDeveloper")} value={rom.developer} />
            <Meta label={t("metaPublisher")} value={rom.publisher} />
            <Meta label={t("metaGenre")} value={rom.genre} />
            <Meta label={t("metaPlayers")} value={rom.players} />
            <Meta label={t("metaGameModes")} value={rom.game_modes} />
            <Meta label={t("metaReleased")} value={rom.release_date} />
            <Meta label={t("metaRegion")} value={rom.region} />
            <Meta label={t("metaLanguage")} value={languages || null} />
            <Meta label={t("metaFranchise")} value={rom.franchise} />
            <Meta label={t("metaAgeRating")} value={rom.age_rating} />
            <Meta label={t("metaFile")} value={rom.filename} />
          </div>
        </Section>

        {variants.length > 0 && (
          <Section title={t("sectionOtherVersions")}>
            <GameVariants variants={variants} platformSlug={rom.platform_slug} />
          </Section>
        )}

        <Section title={t("sectionYourRating")}>
          <GameRating
            romId={rom.id}
            initial={{ rating: rom.user_rating, difficulty: rom.difficulty, completion: rom.completion }}
          />
        </Section>

        <Section title={t("sectionNotes")}>
          <GameNotes romId={rom.id} initial={rom.notes} />
        </Section>
      </div>

      {rom.manual_url && <ManualViewer url={rom.manual_url} title={rom.title} trigger={false} />}
    </div>
  );
}
