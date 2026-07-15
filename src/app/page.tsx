import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb, getSetting, listLibraryForHome, recentlyPlayed, friendIds, HomeLibraryRow } from "@/lib/db";
import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/setup";
import Home, { HomeRom, HomeActivity, HomeShelf } from "@/components/bpm/Home";
import HomeAutoRefresh from "@/components/HomeAutoRefresh";
import { buildRecommendedShelves } from "@/lib/recommend";
import { getHomeNews } from "@/lib/news";

export const dynamic = "force-dynamic";

/** Slim a library row to exactly what the BPM home renders */
const slim = (r: HomeLibraryRow): HomeRom => ({
  id: r.id,
  title: r.title,
  boxart_url: r.boxart_url,
  hero_url: r.hero_url ?? null,
  screenshot_url: r.screenshot_url ?? null,
  platform_slug: r.platform_slug,
  playtime_seconds: r.playtime_seconds,
  added_at: r.added_at ?? null,
});

export default async function HomePage() {
  const user = await requireUser();
  // Fresh install: nudge the admin into the wizard once. After they've seen it
  // (setup_prompted), don't force-redirect again — they can return via /setup
  // and the empty-library welcome below still points the way.
  if (user.isAdmin && needsSetup() && getSetting("setup_prompted") !== "on") redirect("/setup");

  const all = listLibraryForHome(user.id);
  if (all.length === 0) {
    // While setup is still incomplete, lead with the wizard (we only auto-redirect
    // there once); otherwise point at Settings.
    const showWizard = user.isAdmin && needsSetup();
    return (
      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        {/* first scan populates the home the moment it finishes */}
        <HomeAutoRefresh />
        <h1 className="mb-3 text-3xl font-black text-bright">
          Welcome to GameHub, {user.username}!
        </h1>
        <p className="mb-8 text-dim">
          Your library is empty.{" "}
          {user.isAdmin
            ? "Point GameHub at your ROM folders and run a scan to get started."
            : "Ask your admin to scan the ROM library."}
        </p>
        {user.isAdmin && (
          <div className="flex items-center justify-center gap-4">
            {showWizard && (
              <Link href="/setup" className="btn-blue inline-block px-8 py-3">
                Run setup wizard →
              </Link>
            )}
            <Link
              href="/settings"
              className={
                showWizard
                  ? "inline-block px-4 py-3 text-sm text-dim hover:text-body"
                  : "btn-blue inline-block px-8 py-3"
              }
            >
              {showWizard ? "Or configure in Settings" : "Set up your library →"}
            </Link>
          </div>
        )}
      </main>
    );
  }

  // Recent Games: recently played, padded with the newest additions
  const played = recentlyPlayed(user.id, 8);
  const byAdded = [...all].sort(
    (a, b) => (b.added_at ?? "").localeCompare(a.added_at ?? "") || b.id - a.id
  );
  const seen = new Set(played.map((r) => r.id));
  const recent = [...played, ...byAdded.filter((r) => !seen.has(r.id))].slice(0, 8);

  // What's New feed: the latest additions
  const whatsNew = byAdded.slice(0, 10);

  // Friends tab: what your accepted friends have been playing, newest first.
  const fIds = friendIds(user.id);
  const activityRows = (fIds.length === 0
    ? []
    : getDb()
        .prepare(
          `SELECT u.id AS user_id,
                  COALESCE(NULLIF(TRIM(u.real_name), ''), NULLIF(TRIM(u.display_name), ''), u.username) AS user_name,
                  u.avatar_url, ur.last_played_at, r.id, r.title, r.boxart_url, r.hero_url,
                  r.screenshot_url, r.platform_slug, r.added_at,
                  COALESCE(ur.playtime_seconds, 0) AS playtime_seconds
           FROM user_roms ur
           JOIN users u ON u.id = ur.user_id
           JOIN roms r ON r.id = ur.rom_id AND r.missing = 0
           WHERE ur.last_played_at IS NOT NULL
             AND ur.user_id IN (${fIds.map(() => "?").join(",")})
           ORDER BY ur.last_played_at DESC LIMIT 24`
        )
        .all(...fIds)) as {
    user_id: number;
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

  // Recommended tab: several curated shelves derived from the library.
  const recommended: HomeShelf[] = buildRecommendedShelves(all).map((shelf) => ({
    key: shelf.key,
    title: shelf.title,
    subtitle: shelf.subtitle,
    roms: shelf.roms.map(slim),
  }));

  // What's New feed: app changelog, library milestones, announcements, external.
  const news = getHomeNews();

  return (
    <>
      <HomeAutoRefresh />
      <Home
        recent={recent.map(slim)}
        whatsNew={whatsNew.map(slim)}
        activity={activity}
        recommended={recommended}
        news={news}
      />
    </>
  );
}
