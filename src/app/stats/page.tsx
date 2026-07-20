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

/** Days (oldest→newest) for the activity heatmap: a full year back from today. */
function heatmapDays(seconds: Map<string, number>) {
  const out: { day: string; seconds: number }[] = [];
  const today = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, seconds: seconds.get(key) ?? 0 });
  }
  return out;
}

/** Heat level 0–4 from a day's seconds (0 = nothing played). */
function level(sec: number): number {
  if (sec <= 0) return 0;
  if (sec < 900) return 1; // <15m
  if (sec < 3600) return 2; // <1h
  if (sec < 10800) return 3; // <3h
  return 4;
}
const HEAT = ["bg-white/[0.05]", "bg-[#1a9fff]/25", "bg-[#1a9fff]/45", "bg-[#1a9fff]/70", "bg-[#1a9fff]"];

export default async function StatsPage({
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
  const backlog = getBacklog(user.id, { limit: 12 });
  const daysMap = new Map(stats.daily.map((d) => [d.day, d.seconds]));
  const days = heatmapDays(daysMap);
  const maxSystem = stats.bySystem[0]?.seconds ?? 1;

  return (
    <main className="px-[2.8vw] pb-12 pt-4">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-bold text-bright">{t("title")}</h1>
        <Roulette className="ml-auto" />
      </div>

      {/* year picker — plain links so the page stays server-rendered */}
      {stats.years.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Link
            href="/stats"
            className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
              !year ? "bg-[#1a9fff] text-white" : "bg-white/[0.06] text-body hover:bg-white/10"
            }`}
          >
            {t("allTime")}
          </Link>
          {stats.years.map((y) => (
            <Link
              key={y}
              href={`/stats?year=${y}`}
              className={`rounded-full px-3 py-1 text-[13px] font-medium tabular-nums transition-colors ${
                year === y ? "bg-[#1a9fff] text-white" : "bg-white/[0.06] text-body hover:bg-white/10"
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
      )}

      {/* headline numbers */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("totalPlaytime")} value={stats.totalSeconds > 0 ? formatDurationShort(locale, stats.totalSeconds) : "—"} />
        <Stat label={t("gamesPlayed")} value={stats.gamesPlayed.toLocaleString()} />
        <Stat label={t("systemsPlayed")} value={stats.systemsPlayed.toLocaleString()} />
        <Stat label={t("topGame")} value={stats.mostPlayed[0]?.title ?? "—"} small />
      </div>

      {/* activity heatmap */}
      <section className="mb-9">
        <h2 className="mb-3 text-[18px] font-bold text-bright">{t("activity")}</h2>
        {stats.daily.length === 0 ? (
          <p className="rounded-[4px] bg-white/[0.03] px-4 py-5 text-[14px] text-dim">{t("noActivity")}</p>
        ) : (
          <div className="no-scrollbar overflow-x-auto pb-1">
            <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
              {days.map((d) => (
                <span
                  key={d.day}
                  title={`${d.day} — ${d.seconds > 0 ? formatDurationShort(locale, d.seconds) : t("nothingPlayed")}`}
                  className={`h-[11px] w-[11px] rounded-[2px] ${HEAT[level(d.seconds)]}`}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* most played */}
      {stats.mostPlayed.length > 0 && (
        <section className="mb-9">
          <h2 className="mb-3 text-[18px] font-bold text-bright">{t("mostPlayed")}</h2>
          <div className="flex flex-wrap gap-3">
            {stats.mostPlayed.map((g) => (
              <Link key={g.id} href={`/game/${g.id}`} className="group w-[132px]">
                <span className="block h-[176px] w-[132px] overflow-hidden rounded-[4px] bg-black/40">
                  <GameCover
                    title={g.title}
                    boxartUrl={g.boxart_url}
                    color={platformBySlug(g.platform_slug)?.color}
                    shortName={platformBySlug(g.platform_slug)?.shortName}
                    className="h-full w-full"
                  />
                </span>
                <span className="mt-1 block truncate text-[13px] font-semibold text-bright">{g.title}</span>
                <span className="block text-[12px] text-accent">{formatDurationShort(locale, g.playtime_seconds)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* time by system */}
      {stats.bySystem.length > 0 && (
        <section className="mb-9">
          <h2 className="mb-3 text-[18px] font-bold text-bright">{t("bySystem")}</h2>
          <div className="flex max-w-2xl flex-col gap-2">
            {stats.bySystem.map((s) => (
              <div key={s.slug} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-[13px] text-body">
                  {platformBySlug(s.slug)?.name ?? s.slug}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-[#1a9fff]" style={{ width: `${Math.max(3, (s.seconds / maxSystem) * 100)}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right text-[12px] tabular-nums text-dim">
                  {formatDurationShort(locale, s.seconds)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* backlog — shortest unfinished games with known length */}
      <section>
        <h2 className="text-[18px] font-bold text-bright">{t("backlogTitle")}</h2>
        <p className="mb-3 text-[13px] text-dim">{t("backlogSubtitle")}</p>
        {backlog.length === 0 ? (
          <p className="rounded-[4px] bg-white/[0.03] px-4 py-5 text-[14px] text-dim">{t("backlogEmpty")}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {backlog.map((g) => (
              <Link key={g.id} href={`/game/${g.id}`} className="w-[132px]">
                <span className="block h-[176px] w-[132px] overflow-hidden rounded-[4px] bg-black/40">
                  <GameCover
                    title={g.title}
                    boxartUrl={g.boxart_url}
                    color={platformBySlug(g.platform_slug)?.color}
                    shortName={platformBySlug(g.platform_slug)?.shortName}
                    className="h-full w-full"
                  />
                </span>
                <span className="mt-1 block truncate text-[13px] font-semibold text-bright">{g.title}</span>
                <span className="block text-[12px] text-accent">
                  {t("aboutHours", { hours: Math.max(1, Math.round(g.hltb_main / 3600)) })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <ScrollToTop />
    </main>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-[6px] bg-white/[0.04] px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-widest text-dim">{label}</div>
      <div className={`mt-1 truncate font-semibold text-bright ${small ? "text-[15px]" : "text-[22px] tabular-nums"}`}>
        {value}
      </div>
    </div>
  );
}
