import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { recentlyPlayed } from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";
import {
  getProfileUser,
  profileName,
  profileStats,
  profileComments,
  PROFILE_THEMES,
} from "@/lib/profile";
import { profileBadges, evaluateBadges } from "@/lib/badges";
import { raProgress } from "@/lib/providers/retroachievements";
import { getRaLink, getRaCreds } from "@/lib/userRa";
import BadgeIcon from "@/components/BadgeIcon";
import ProfileComments, { ProfileCommentView } from "@/components/ProfileComments";
import PlaySummary from "@/components/PlaySummary";

export const dynamic = "force-dynamic";

function hoursOnRecord(seconds: number): string {
  const h = seconds / 3600;
  return h >= 10 ? `${Math.round(h)} hrs` : `${Math.max(0.1, Math.round(h * 10) / 10)} hrs`;
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("accountPages.profile");
  const viewer = await requireUser();
  const { id } = await params;
  const user = getProfileUser(Number(id));
  if (!user) notFound();

  const own = viewer.id === user.id;
  const name = profileName(user);
  const stats = profileStats(user.id);
  // Keep the viewer's own badges current on first load; others display as stored
  // (their own sessions award theirs). Never let it break the page.
  if (own) {
    try {
      evaluateBadges({ id: user.id, isAdmin: viewer.isAdmin });
    } catch {
      /* ignore */
    }
  }
  const { badges, xp, level } = profileBadges(user.id);
  const featured =
    badges.find((b) => b.key === user.featured_badge) ??
    [...badges].sort((a, b) => b.xp - a.xp)[0] ??
    null;
  const theme = PROFILE_THEMES[user.theme ?? "default"] ?? PROFILE_THEMES.default;

  // This profile's own RetroAchievements link — used both for the shown
  // username and to pull their unlock progress with their own credentials.
  const raLink = getRaLink(user.id);
  const raCreds = getRaCreds(user.id);

  const status = user.status ?? "online";
  const statusLabel = own
    ? status === "online"
      ? t("currentlyOnline")
      : status === "away"
        ? t("away")
        : t("invisible")
    : status === "online"
      ? t("currentlyOnline")
      : status === "away"
        ? t("away")
        : t("offline");
  const statusOnline = status === "online";

  // Recent activity with live RetroAchievements progress where available
  const recent = recentlyPlayed(user.id, 3);
  const activity = await Promise.all(
    recent.map(async (rom) => {
      let earned: number | null = null;
      let total: number | null = null;
      if (raCreds && rom.ra_game_id) {
        try {
          const p = await raProgress(raCreds, rom.ra_game_id);
          if (p) {
            earned = p.earned;
            total = p.total;
          }
        } catch {}
      }
      return { rom, earned, total };
    })
  );

  const comments = profileComments(user.id);
  const commentViews: ProfileCommentView[] = comments.map((c) => ({
    id: c.id,
    body: c.body,
    created_at: c.created_at,
    authorName: c.author_display?.trim() || c.author_name,
    authorAvatar: c.author_avatar,
    canDelete: viewer.isAdmin || own || c.author_id === viewer.id,
  }));

  const tiles = [
    { label: t("badges"), value: stats.games >= 0 ? badges.length : 0, href: "#badges" },
    { label: t("games"), value: stats.games, href: "/library" },
    { label: t("favorites"), value: stats.favorites, href: "/library" },
    { label: t("collections"), value: stats.collections, href: "/collections" },
    { label: t("saveStates"), value: stats.saveStates, href: null },
  ];

  return (
    <main className="-mt-12 min-h-screen pb-10">
      {/* Themed backdrop with optional custom background image */}
      <div className="relative">
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(180deg, ${theme.from} 0%, ${theme.to} 55vh, transparent 100vh)` }}
        />
        {user.background_url && (
          <div
            className="absolute inset-x-0 top-0 h-[70vh] bg-cover bg-top opacity-35"
            style={{
              backgroundImage: `url(${JSON.stringify(user.background_url)})`,
              maskImage: "linear-gradient(180deg, black 55%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(180deg, black 55%, transparent 100%)",
            }}
          />
        )}

        <div className="relative mx-auto max-w-[1200px] px-6 pt-24">
          {/* Header: avatar + identity + level box */}
          <div className="flex flex-col gap-8 md:flex-row md:items-start">
            <div className="shrink-0">
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-40 w-40 rounded-[4px] object-cover shadow-2xl ring-2 ring-white/25"
                />
              ) : (
                <div className="flex h-40 w-40 items-center justify-center rounded-[4px] bg-accent/20 text-6xl font-black text-accent shadow-2xl ring-2 ring-white/25">
                  {name.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 pt-1">
              <h1 className="text-3xl font-bold text-bright">{name}</h1>
              {(user.real_name || user.location) && (
                <div className="mt-1 flex items-center gap-3 text-sm text-body">
                  {user.real_name && <span>{user.real_name}</span>}
                  {user.location && <span className="text-dim">📍 {user.location}</span>}
                </div>
              )}
              {raLink.linked && (
                <div className="mt-1 text-sm text-dim">
                  RetroAchievements:{" "}
                  <a
                    href={`https://retroachievements.org/user/${encodeURIComponent(raLink.username ?? "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-body hover:text-accent"
                  >
                    {raLink.username}
                  </a>
                </div>
              )}
              <div
                className={`mt-4 text-lg font-semibold ${statusOnline ? "text-[#57cbde]" : "text-dim"}`}
              >
                {statusLabel}
              </div>
            </div>

            {/* Level + featured badge, like Steam's right rail */}
            <div className="w-full shrink-0 md:w-72">
              <div className="flex items-center justify-between rounded-[3px] border border-white/25 bg-black/25 px-5 py-4">
                <span className="text-2xl text-bright">{t("level")}</span>
                <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#c02942] text-xl font-bold text-bright">
                  {level}
                </span>
              </div>
              {featured && (
                <div className="mt-2 flex items-center gap-4 rounded-[3px] bg-black/35 px-4 py-3">
                  <BadgeIcon badge={featured} size="md" />
                  <div>
                    <div className="text-[15px] font-semibold text-bright">{featured.name}</div>
                    <div className="text-sm text-dim">{t("xp", { xp: xp.toLocaleString() })}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tiles row */}
          <div className="mt-10 flex gap-2 overflow-x-auto pb-1">
            {tiles.map((t) =>
              t.href ? (
                <Link
                  key={t.label}
                  href={t.href}
                  className="flex min-w-40 flex-1 items-baseline gap-3 rounded-[3px] bg-[#1b2028]/90 px-5 py-5 transition-colors hover:bg-[#232a34]"
                >
                  <span className="text-[15px] font-semibold text-body">{t.label}</span>
                  <span className="text-2xl font-light text-dim">{t.value.toLocaleString()}</span>
                </Link>
              ) : (
                <div
                  key={t.label}
                  className="flex min-w-40 flex-1 items-baseline gap-3 rounded-[3px] bg-[#1b2028]/90 px-5 py-5"
                >
                  <span className="text-[15px] font-semibold text-body">{t.label}</span>
                  <span className="text-2xl font-light text-dim">{t.value.toLocaleString()}</span>
                </div>
              )
            )}
          </div>

          {/* Recent activity */}
          <section className="mt-8 rounded-[3px] bg-[#141a22]/95 p-6">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-bright">
              {t("recentActivity")}
            </h2>
            {activity.length === 0 && (
              <p className="text-sm text-dim">{t("nothingPlayed")}</p>
            )}
            <div className="flex flex-col gap-4">
              {activity.map(({ rom, earned, total }) => {
                const platform = platformBySlug(rom.platform_slug);
                const banner = rom.hero_url ?? rom.screenshot_url ?? rom.boxart_url;
                return (
                  <div key={rom.id} className="rounded bg-[#1b222c] p-4">
                    <div className="flex items-center gap-5">
                      <Link href={`/game/${rom.id}`} className="shrink-0">
                        {banner ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={banner}
                            alt=""
                            className="h-20 w-44 rounded object-cover"
                          />
                        ) : (
                          <div
                            className="flex h-20 w-44 items-center justify-center rounded text-xs font-bold text-white/70"
                            style={{ background: platform?.color ?? "#2a3540" }}
                          >
                            {platform?.shortName ?? rom.platform_slug}
                          </div>
                        )}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/game/${rom.id}`}
                          className="text-lg font-semibold text-bright hover:text-accent"
                        >
                          {rom.title}
                        </Link>
                        <div className="text-xs text-dim">{platform?.name ?? rom.platform_slug}</div>
                      </div>
                      <div className="shrink-0 text-right text-sm text-dim">
                        <div>{t("onRecord", { value: hoursOnRecord(rom.playtime_seconds) })}</div>
                        {rom.last_played_at && (
                          <div>{t("lastPlayedOn", { date: rom.last_played_at.slice(0, 10) })}</div>
                        )}
                      </div>
                    </div>
                    {earned !== null && total !== null && total > 0 && (
                      <div className="mt-3 flex items-center gap-4 border-t border-white/5 pt-3">
                        <span className="rounded bg-white/5 px-3 py-1.5 text-xs font-semibold text-body">
                          {t("achievementProgress")}
                        </span>
                        <span className="text-sm text-body">
                          {t("earnedOfTotal", { earned, total })}
                        </span>
                        <div className="h-2 w-56 overflow-hidden rounded-full bg-black/50">
                          <div
                            className="h-full bg-[#4c9e28]"
                            style={{ width: `${Math.round((earned / total) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Personal play breakdown — only on your own profile */}
          {own && <PlaySummary />}

          {/* Badges */}
          <section id="badges" className="mt-6 rounded-[3px] bg-[#141a22]/95 p-6">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-bright">
              {t("badges")} <span className="ml-2 font-normal normal-case text-dim">{badges.length}</span>
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {badges.map((b) => (
                <div key={b.key} className="flex items-center gap-4 rounded bg-[#1b222c] p-4">
                  <BadgeIcon badge={b} size="md" />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-bright">{b.name}</div>
                    <div className="truncate text-xs text-dim">{b.detail}</div>
                    <div className="text-xs text-dim">{t("xp", { xp: b.xp })}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Comments */}
          <section className="mt-6 rounded-[3px] bg-[#141a22]/95 p-6">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-bright">
              {t("comments")}
            </h2>
            <ProfileComments profileId={user.id} comments={commentViews} />
          </section>
        </div>
      </div>
    </main>
  );
}
