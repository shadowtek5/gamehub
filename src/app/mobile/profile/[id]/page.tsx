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

export const dynamic = "force-dynamic";

function hoursOnRecord(seconds: number): string {
  const h = seconds / 3600;
  return h >= 10 ? `${Math.round(h)} hrs` : `${Math.max(0.1, Math.round(h * 10) / 10)} hrs`;
}

export default async function MobileProfileViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("mobilePagesC.profileView");
  const viewer = await requireUser();
  const { id } = await params;
  const user = getProfileUser(Number(id));
  if (!user) notFound();

  const own = viewer.id === user.id;
  const name = profileName(user);
  const stats = profileStats(user.id);
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

  const raLink = getRaLink(user.id);
  const raCreds = getRaCreds(user.id);

  const status = user.status ?? "online";
  const statusOnline = status === "online";
  const statusLabel = statusOnline
    ? t("statusOnline")
    : status === "away"
      ? t("statusAway")
      : own
        ? t("statusInvisible")
        : t("statusOffline");

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

  const tiles: { label: string; value: number; href: string | null }[] = [
    { label: t("tileBadges"), value: badges.length, href: null },
    { label: t("tileGames"), value: stats.games, href: "/mobile/library" },
    { label: t("tileFavorites"), value: stats.favorites, href: "/mobile/library" },
    { label: t("tileCollections"), value: stats.collections, href: "/mobile/collections" },
    { label: t("tileSaveStates"), value: stats.saveStates, href: null },
  ];

  return (
    <div>
      {/* Hero: background art + avatar + identity */}
      <div className="-mx-4 -mt-3">
        <div className="relative">
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(180deg, ${theme.from} 0%, ${theme.to} 100%)` }}
          />
          {user.background_url && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-40"
              style={{
                backgroundImage: `url(${JSON.stringify(user.background_url)})`,
                maskImage: "linear-gradient(180deg, black 40%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(180deg, black 40%, transparent 100%)",
              }}
            />
          )}
          <div className="relative flex flex-col items-center px-4 pb-5 pt-8 text-center">
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                alt=""
                className="h-24 w-24 rounded-[10px] object-cover shadow-2xl ring-2 ring-white/25"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-[10px] bg-accent/20 text-4xl font-black text-accent shadow-2xl ring-2 ring-white/25">
                {name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <h1 className="mt-3 text-[22px] font-black text-bright">{name}</h1>
            {(user.real_name || user.location) && (
              <div className="mt-0.5 text-[13px] text-body">
                {user.real_name}
                {user.real_name && user.location && " · "}
                {user.location && <span className="text-dim">📍 {user.location}</span>}
              </div>
            )}
            <div className={`mt-1 text-[14px] font-semibold ${statusOnline ? "text-[#57cbde]" : "text-dim"}`}>
              {statusLabel}
            </div>
            {raLink.linked && (
              <div className="mt-1 text-[12px] text-dim">
                {t("retroAchievementsLabel")} <span className="text-body">{raLink.username}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Level + featured badge */}
      <div className="mt-4 flex items-center justify-between rounded-[12px] border border-white/15 bg-black/25 px-4 py-3">
        <span className="text-[18px] text-bright">{t("level")}</span>
        <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#c02942] text-[17px] font-bold text-bright">
          {level}
        </span>
      </div>
      {featured && (
        <div className="mt-2 flex items-center gap-3 rounded-[12px] bg-[#1a1f27] px-4 py-3 ring-1 ring-white/5">
          <BadgeIcon badge={featured} size="md" />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-bright">{featured.name}</div>
            <div className="text-[13px] text-dim">{t("xpValue", { xp: xp.toLocaleString() })}</div>
          </div>
        </div>
      )}
      {/* Stat tiles */}
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tiles.map((t) => {
          const inner = (
            <>
              <span className="text-[13px] font-semibold text-body">{t.label}</span>
              <span className="text-[18px] font-light text-dim">{t.value.toLocaleString()}</span>
            </>
          );
          return t.href ? (
            <Link
              key={t.label}
              href={t.href}
              className="flex min-w-[7rem] shrink-0 flex-col gap-0.5 rounded-[10px] bg-[#1a1f27] px-4 py-3 ring-1 ring-white/5 active:bg-[#232a34]"
            >
              {inner}
            </Link>
          ) : (
            <div
              key={t.label}
              className="flex min-w-[7rem] shrink-0 flex-col gap-0.5 rounded-[10px] bg-[#1a1f27] px-4 py-3 ring-1 ring-white/5"
            >
              {inner}
            </div>
          );
        })}
      </div>

      {/* Recent activity */}
      <section className="mt-5">
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-dim">{t("recentActivity")}</h2>
        {activity.length === 0 ? (
          <p className="rounded-[10px] bg-[#1a1f27] p-4 text-[13px] text-dim">
            {t("nothingPlayed")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {activity.map(({ rom, earned, total }) => {
              const platform = platformBySlug(rom.platform_slug);
              const banner = rom.hero_url ?? rom.screenshot_url ?? rom.boxart_url;
              return (
                <div key={rom.id} className="rounded-[10px] bg-[#1a1f27] p-3 ring-1 ring-white/5">
                  <div className="flex items-center gap-3">
                    <Link href={`/mobile/game/${rom.id}`} className="shrink-0">
                      {banner ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={banner} alt="" className="h-14 w-24 rounded-[6px] object-cover" />
                      ) : (
                        <div
                          className="flex h-14 w-24 items-center justify-center rounded-[6px] text-[10px] font-bold text-white/70"
                          style={{ background: platform?.color ?? "#2a3540" }}
                        >
                          {platform?.shortName ?? rom.platform_slug}
                        </div>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={`/mobile/game/${rom.id}`} className="block truncate text-[15px] font-semibold text-bright">
                        {rom.title}
                      </Link>
                      <div className="truncate text-[12px] text-dim">{platform?.name ?? rom.platform_slug}</div>
                      <div className="mt-0.5 text-[11px] text-dim">
                        {hoursOnRecord(rom.playtime_seconds)} {t("onRecord")}
                        {rom.last_played_at && ` · ${rom.last_played_at.slice(0, 10)}`}
                      </div>
                    </div>
                  </div>
                  {earned !== null && total !== null && total > 0 && (
                    <div className="mt-2.5 flex items-center gap-3 border-t border-white/5 pt-2.5">
                      <span className="shrink-0 text-[11px] font-semibold text-body">
                        {earned}/{total}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/50">
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
        )}
      </section>

      {/* Badges */}
      <section className="mt-5">
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-dim">
          {t("tileBadges")} <span className="ml-1 font-normal normal-case text-dim">{badges.length}</span>
        </h2>
        <div className="flex flex-col gap-2">
          {badges.map((b) => (
            <div key={b.key} className="flex items-center gap-3 rounded-[10px] bg-[#1a1f27] p-3 ring-1 ring-white/5">
              <BadgeIcon badge={b} size="md" />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold text-bright">{b.name}</div>
                <div className="truncate text-[12px] text-dim">{b.detail}</div>
                <div className="text-[11px] text-dim">{t("xpValue", { xp: b.xp })}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comments */}
      <section className="mt-5">
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-dim">{t("comments")}</h2>
        <ProfileComments profileId={user.id} comments={commentViews} />
      </section>
    </div>
  );
}
