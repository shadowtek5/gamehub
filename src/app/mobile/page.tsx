import { requireUser } from "@/lib/auth";
import { getDb, listLibrary, recentlyPlayed, LibraryRomRow } from "@/lib/db";
import type { HomeRom, HomeActivity, HomeShelf } from "@/components/bpm/Home";
import { buildRecommendedShelves } from "@/lib/recommend";
import { getHomeNews } from "@/lib/news";
import { getTranslations } from "next-intl/server";
import MobileHome from "@/components/mobile/MobileHome";
import HomeAutoRefresh from "@/components/HomeAutoRefresh";

export const dynamic = "force-dynamic";

/** Slim a library row to exactly what the home shelves render. */
const slim = (r: LibraryRomRow): HomeRom => ({
  id: r.id,
  title: r.title,
  boxart_url: r.boxart_url,
  hero_url: r.hero_url ?? null,
  screenshot_url: r.screenshot_url ?? null,
  platform_slug: r.platform_slug,
  playtime_seconds: r.playtime_seconds,
  added_at: r.added_at ?? null,
});

export default async function MobileHomePage() {
  const user = await requireUser();
  const t = await getTranslations("mobilePagesA.home");
  const all = listLibrary(user.id);

  if (all.length === 0) {
    return (
      <div>
        <HomeAutoRefresh />
        <h1 className="mb-5 mt-1 text-[22px] font-black text-bright">{t("greeting", { username: user.username })}</h1>
        <div className="rounded-[8px] bg-[#1a1f27] p-6 text-center text-sm text-dim">
          {t("emptyLibrary")}
        </div>
      </div>
    );
  }

  // Recent: recently played, padded with the newest additions (mirrors desktop).
  const played = recentlyPlayed(user.id, 12);
  const byAdded = [...all].sort(
    (a, b) => (b.added_at ?? "").localeCompare(a.added_at ?? "") || b.id - a.id
  );
  const seen = new Set(played.map((r) => r.id));
  const recent = [...played, ...byAdded.filter((r) => !seen.has(r.id))].slice(0, 12);

  // What's New carousel: the latest additions.
  const whatsNew = byAdded.slice(0, 12);

  // Friends tab: what everyone has been playing, newest first.
  const activityRows = getDb()
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS user_name,
              u.avatar_url, ur.last_played_at, r.id, r.title, r.boxart_url, r.hero_url,
              r.screenshot_url, r.platform_slug, r.added_at,
              COALESCE(ur.playtime_seconds, 0) AS playtime_seconds
       FROM user_roms ur
       JOIN users u ON u.id = ur.user_id
       JOIN roms r ON r.id = ur.rom_id AND r.missing = 0
       WHERE ur.last_played_at IS NOT NULL
       ORDER BY ur.last_played_at DESC LIMIT 24`
    )
    .all() as {
    user_name: string;
    avatar_url: string | null;
    last_played_at: string;
    id: number;
    title: string;
    boxart_url: string | null;
    hero_url: string | null;
    screenshot_url: string | null;
    platform_slug: string;
    added_at: string | null;
    playtime_seconds: number;
  }[];
  const activity: HomeActivity[] = activityRows.map((row) => ({
    userName: row.user_name,
    avatarUrl: row.avatar_url,
    playedAt: row.last_played_at,
    rom: {
      id: row.id,
      title: row.title,
      boxart_url: row.boxart_url,
      hero_url: row.hero_url,
      screenshot_url: row.screenshot_url,
      platform_slug: row.platform_slug,
      playtime_seconds: row.playtime_seconds,
      added_at: row.added_at,
    },
  }));

  // Recommended tab: curated shelves derived from the library.
  const recommended: HomeShelf[] = buildRecommendedShelves(all).map((shelf) => ({
    key: shelf.key,
    title: shelf.title,
    subtitle: shelf.subtitle,
    roms: shelf.roms.map(slim),
  }));

  // What's New feed: app changelog, milestones, announcements, external.
  const news = getHomeNews();

  return (
    <>
      <HomeAutoRefresh />
      <MobileHome
        userName={user.username}
        recent={recent.map(slim)}
        whatsNew={whatsNew.map(slim)}
        activity={activity}
        recommended={recommended}
        news={news}
      />
    </>
  );
}
