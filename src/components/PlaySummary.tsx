"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { PlaySummary } from "@/lib/playSummary";

const fmtHrs = (h: number) => (h >= 10 ? `${Math.round(h)}h` : `${h}h`);

function Bar({ label, value, max, href }: { label: string; value: number; max: number; href?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  const body = (
    <div className="group flex items-center gap-3">
      <span className="w-40 shrink-0 truncate text-[13px] text-body group-hover:text-bright">{label}</span>
      <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-black/40">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent/70"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-14 shrink-0 text-right text-[12px] text-dim">{fmtHrs(value)}</span>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export default function PlaySummary() {
  const t = useTranslations("related");
  const [data, setData] = useState<PlaySummary | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/stats/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || !data) return null;
  if (data.gamesPlayed === 0) return null; // nothing to celebrate yet

  const maxGame = data.topGames[0]?.hours ?? 0;
  const maxSys = data.bySystem[0]?.hours ?? 0;
  const maxGenre = data.topGenres[0]?.count ?? 0;
  const { backlog, playing, beaten, dropped } = data.status;

  return (
    <section className="mt-8 rounded-[3px] bg-[#141a22]/95 p-6">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-bright">{t("playSummary.title")}</h2>

      {/* Headline numbers */}
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { label: t("playSummary.hoursPlayed"), value: data.totalHours.toLocaleString() },
          { label: t("playSummary.gamesPlayed"), value: data.gamesPlayed.toLocaleString() },
          { label: t("playSummary.beaten"), value: beaten.toLocaleString() },
          { label: t("playSummary.playing"), value: playing.toLocaleString() },
          { label: t("playSummary.backlog"), value: backlog.toLocaleString() },
          { label: t("playSummary.dropped"), value: dropped.toLocaleString() },
        ].map((item) => (
          <div key={item.label} className="flex min-w-[110px] flex-1 flex-col rounded-[3px] bg-[#1b2028]/90 px-4 py-3">
            <span className="text-2xl font-light text-bright">{item.value}</span>
            <span className="mt-0.5 text-[12px] text-dim">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {data.topGames.length > 0 && (
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-body">{t("playSummary.mostPlayed")}</h3>
            <div className="flex flex-col gap-2">
              {data.topGames.map((g) => (
                <Bar key={g.id} label={g.title} value={g.hours} max={maxGame} href={`/game/${g.id}`} />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-6">
          {data.bySystem.length > 0 && (
            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-body">{t("playSummary.timeBySystem")}</h3>
              <div className="flex flex-col gap-2">
                {data.bySystem.map((s) => (
                  <Bar key={s.slug} label={s.name} value={s.hours} max={maxSys} />
                ))}
              </div>
            </div>
          )}

          {data.topGenres.length > 0 && (
            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-body">{t("playSummary.favouriteGenres")}</h3>
              <div className="flex flex-wrap gap-1.5">
                {data.topGenres.map((g) => (
                  <span
                    key={g.genre}
                    className="rounded-full bg-[#1b2028] px-3 py-1 text-[12px] text-body"
                    style={{ opacity: maxGenre > 0 ? 0.55 + 0.45 * (g.count / maxGenre) : 1 }}
                  >
                    {g.genre} <span className="text-dim">{g.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
