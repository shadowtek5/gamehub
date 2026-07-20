import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getPlayStats, getBacklog } from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";
import { formatDurationShort } from "@/lib/format";
import GameCover from "@/components/GameCover";
import Roulette from "@/components/Roulette";
import ScrollToTop from "@/components/ScrollToTop";

export const dynamic = "force-dynamic";

function heatmapDays(seconds: Map<string, number>) {
  const out: { day: string; seconds: number }[] = [];
  const today = new Date();
  // ~26 weeks on mobile — a full year doesn't fit a phone width
  for (let i = 181; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, seconds: seconds.get(key) ?? 0 });
  }
  return out;
}
function level(sec: number): number {
  if (sec <= 0) return 0;
  if (sec < 900) return 1;
  if (sec < 3600) return 2;
  if (sec < 10800) return 3;
  return 4;
}
const HEAT = ["bg-white/[0.05]", "bg-[#1a9fff]/25", "bg-[#1a9fff]/45", "bg-[#1a9fff]/70", "bg-[#1a9fff]"];

export default async function MobileStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await requireUser();
  const t = await getTranslations("stats");
  const locale = await getLocale();
  const { year: yearParam } = await searchParams;
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined;

  const stats = getPlayStats(user.id, year);
  const backlog = getBacklog(user.id, { limit: 8 });
  const days = heatmapDays(new Map(stats.daily.map((d) => [d.day, d.seconds])));
  const maxSystem = stats.bySystem[0]?.seconds ?? 1;

  return (
    <div>
      <div className="mb-3 mt-1 flex items-center gap-2">
        <h1 className="flex-1 text-[22px] font-black text-bright">{t("title")}</h1>
        <Roulette />
      </div>

      {stats.years.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Link href="/mobile/stats" className={`rounded-full px-3 py-1 text-[12px] font-medium ${!year ? "bg-[#1a9fff] text-white" : "bg-white/[0.06] text-body"}`}>
            {t("allTime")}
          </Link>
          {stats.years.map((y) => (
            <Link key={y} href={`/mobile/stats?year=${y}`} className={`rounded-full px-3 py-1 text-[12px] font-medium tabular-nums ${year === y ? "bg-[#1a9fff] text-white" : "bg-white/[0.06] text-body"}`}>
              {y}
            </Link>
          ))}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-2">
        <Stat label={t("totalPlaytime")} value={stats.totalSeconds > 0 ? formatDurationShort(locale, stats.totalSeconds) : "—"} />
        <Stat label={t("gamesPlayed")} value={stats.gamesPlayed.toLocaleString()} />
        <Stat label={t("systemsPlayed")} value={stats.systemsPlayed.toLocaleString()} />
        <Stat label={t("topGame")} value={stats.mostPlayed[0]?.title ?? "—"} small />
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-[16px] font-bold text-bright">{t("activity")}</h2>
        {stats.daily.length === 0 ? (
          <p className="rounded-[8px] bg-white/[0.03] px-3 py-4 text-[13px] text-dim">{t("noActivity")}</p>
        ) : (
          <div className="no-scrollbar overflow-x-auto pb-1">
            <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
              {days.map((d) => (
                <span key={d.day} className={`h-[10px] w-[10px] rounded-[2px] ${HEAT[level(d.seconds)]}`} />
              ))}
            </div>
          </div>
        )}
      </section>

      {stats.mostPlayed.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[16px] font-bold text-bright">{t("mostPlayed")}</h2>
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
            {stats.mostPlayed.map((g) => (
              <Link key={g.id} href={`/mobile/game/${g.id}`} className="w-[104px] shrink-0">
                <span className="block h-[139px] w-[104px] overflow-hidden rounded-[6px] bg-black/40">
                  <GameCover title={g.title} boxartUrl={g.boxart_url} color={platformBySlug(g.platform_slug)?.color} shortName={platformBySlug(g.platform_slug)?.shortName} className="h-full w-full" />
                </span>
                <span className="mt-1 block truncate text-[12px] font-semibold text-bright">{g.title}</span>
                <span className="block text-[11px] text-accent">{formatDurationShort(locale, g.playtime_seconds)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {stats.bySystem.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[16px] font-bold text-bright">{t("bySystem")}</h2>
          <div className="flex flex-col gap-1.5">
            {stats.bySystem.map((s) => (
              <div key={s.slug} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[12px] text-body">{platformBySlug(s.slug)?.name ?? s.slug}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-[#1a9fff]" style={{ width: `${Math.max(3, (s.seconds / maxSystem) * 100)}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-dim">{formatDurationShort(locale, s.seconds)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-[16px] font-bold text-bright">{t("backlogTitle")}</h2>
        <p className="mb-2 text-[12px] text-dim">{t("backlogSubtitle")}</p>
        {backlog.length === 0 ? (
          <p className="rounded-[8px] bg-white/[0.03] px-3 py-4 text-[13px] text-dim">{t("backlogEmpty")}</p>
        ) : (
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
            {backlog.map((g) => (
              <Link key={g.id} href={`/mobile/game/${g.id}`} className="w-[104px] shrink-0">
                <span className="block h-[139px] w-[104px] overflow-hidden rounded-[6px] bg-black/40">
                  <GameCover title={g.title} boxartUrl={g.boxart_url} color={platformBySlug(g.platform_slug)?.color} shortName={platformBySlug(g.platform_slug)?.shortName} className="h-full w-full" />
                </span>
                <span className="mt-1 block truncate text-[12px] font-semibold text-bright">{g.title}</span>
                <span className="block text-[11px] text-accent">{t("aboutHours", { hours: Math.max(1, Math.round(g.hltb_main / 3600)) })}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <ScrollToTop className="bottom-[84px] right-4" />
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-[8px] bg-white/[0.04] px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-dim">{label}</div>
      <div className={`mt-0.5 truncate font-semibold text-bright ${small ? "text-[13px]" : "text-[18px] tabular-nums"}`}>{value}</div>
    </div>
  );
}
