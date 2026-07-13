"use client";

// Settings → Reports: pick a single report to generate (running all at once is
// slow — the hash-health pass verifies every hashed game against the DAT). Each
// report fetches /api/reports?type=<id> on demand and can be downloaded as JSON.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { GpSubHeader, GpButton } from "./bpm/primitives";
import { formatBytes, formatPlaytime } from "@/lib/format";
import type {
  ReportMeta,
  ReportId,
  RomRef,
  OverviewReport,
  MostPlayedReport,
  MissingReport,
  DuplicatesReport,
  HashHealthReport,
  ScrapeGapsReport,
} from "@/lib/report";

interface ReportResult {
  id: ReportId;
  label: string;
  generatedAt: string;
  data: unknown;
}

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-[4px] bg-[#23262e] px-4 py-3 ring-1 ring-white/5">
      <div className="text-[22px] font-bold leading-tight text-bright">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-dim">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-dim/70">{hint}</div>}
    </div>
  );
}

function RomList({ items, empty }: { items: RomRef[]; empty: string }) {
  if (!items.length) return empty ? <p className="py-2 text-[13px] text-dim">{empty}</p> : null;
  return (
    <div className="flex flex-col divide-y divide-white/[0.05]">
      {items.map((r) => (
        <Link
          key={`${r.id}-${r.filename}`}
          href={`/game/${r.id}`}
          className="flex items-center justify-between gap-4 px-1 py-1.5 text-[13px] hover:bg-white/[0.04]"
        >
          <span className="min-w-0 truncate text-body">
            {r.title}
            {r.note && <span className="ml-2 text-[11px] text-accent/80">{r.note}</span>}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-dim">{r.platform_slug}</span>
        </Link>
      ))}
    </div>
  );
}

function Issue({
  title,
  count,
  tone = "warn",
  cap,
  children,
}: {
  title: string;
  count: number;
  tone?: "warn" | "bad";
  cap?: number;
  children?: React.ReactNode;
}) {
  const color = count === 0 ? "#8ce05f" : tone === "bad" ? "#e0625f" : "#e8c268";
  return (
    <details className="rounded-[4px] bg-[#23262e] ring-1 ring-white/5" open={count > 0}>
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-[14px] text-body">
        <span>{title}</span>
        <span className="rounded-[3px] px-2 py-0.5 text-[13px] font-bold" style={{ backgroundColor: `${color}22`, color }}>
          {count.toLocaleString()}
        </span>
      </summary>
      {count > 0 && children && (
        <div className="border-t border-white/5 px-4 py-2">
          {children}
          {cap != null && count > cap && (
            <p className="pt-1 text-[11px] text-dim">+{(count - cap).toLocaleString()} more — see downloaded JSON</p>
          )}
        </div>
      )}
    </details>
  );
}

// ---- per-report renderers ----

function OverviewView({ r }: { r: OverviewReport }) {
  const t = useTranslations("maintenance.reportsPanel");
  const o = r.overview;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        <Stat label={t("games")} value={o.games.toLocaleString()} hint={formatBytes(o.totalBytes)} />
        <Stat label={t("scraped")} value={pct(o.scraped, o.games)} hint={t("withoutArtInfo", { count: o.unscraped })} />
        <Stat label={t("hashed")} value={pct(o.hashed, o.games)} hint={t("unhashed", { count: o.unhashed })} />
        <Stat label={t("missingFiles")} value={o.missing.toLocaleString()} hint={t("inDbGoneFromDisk")} />
        <Stat label={t("users")} value={o.users} hint={t("activeCount", { count: o.activeUsers })} />
        <Stat label={t("playTime")} value={formatPlaytime(o.totalPlaytimeSeconds) || "—"} hint={t("gamesPlayed", { count: o.playedGames })} />
        <Stat label={t("collections")} value={o.collections} />
        <Stat label={t("saveStates")} value={o.saveStates} />
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-dim">
            <tr className="border-b border-white/10">
              <th className="py-2 pr-4 font-bold">{t("system")}</th>
              <th className="py-2 pr-4 font-bold">{t("games")}</th>
              <th className="py-2 pr-4 font-bold">{t("scraped")}</th>
              <th className="py-2 pr-4 font-bold">{t("hashed")}</th>
              <th className="py-2 font-bold">{t("size")}</th>
            </tr>
          </thead>
          <tbody>
            {r.systems.map((s) => (
              <tr key={s.slug} className="border-b border-white/5">
                <td className="py-1.5 pr-4 text-body">{s.name}</td>
                <td className="py-1.5 pr-4 text-body">{s.games}</td>
                <td className="py-1.5 pr-4 text-dim">{pct(s.scraped, s.games)}</td>
                <td className="py-1.5 pr-4 text-dim">{pct(s.hashed, s.games)}</td>
                <td className="py-1.5 text-dim">{formatBytes(s.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MostPlayedView({ r }: { r: MostPlayedReport }) {
  const t = useTranslations("maintenance.reportsPanel");
  if (!r.mostPlayed.length) return <p className="text-sm text-dim">{t("noPlayTime")}</p>;
  return (
    <div className="flex flex-col divide-y divide-white/[0.05] rounded-[4px] bg-[#23262e] px-4 ring-1 ring-white/5">
      {r.mostPlayed.map((g, i) => (
        <Link key={g.id} href={`/game/${g.id}`} className="flex items-center justify-between gap-4 py-2 text-[13px] hover:text-bright">
          <span className="min-w-0 truncate text-body">
            <span className="mr-2 text-dim">{i + 1}.</span>
            {g.title}
          </span>
          <span className="shrink-0 text-dim">{formatPlaytime(g.playtimeSeconds)}</span>
        </Link>
      ))}
    </div>
  );
}

function MissingView({ r }: { r: MissingReport }) {
  const t = useTranslations("maintenance.reportsPanel");
  return (
    <Issue title={t("missingTitle")} count={r.missingFiles.count} tone="bad" cap={r.missingFiles.items.length}>
      <RomList items={r.missingFiles.items} empty={t("none")} />
    </Issue>
  );
}

function DuplicatesView({ r }: { r: DuplicatesReport }) {
  const t = useTranslations("maintenance.reportsPanel");
  return (
    <Issue title={t("duplicatesTitle")} count={r.duplicates.count}>
      <div className="flex flex-col gap-2">
        {r.duplicates.groups.map((g, i) => (
          <div key={i} className="rounded-[3px] bg-black/20 px-2 py-1">
            <div className="truncate text-[12px] font-semibold text-body">{g.title}</div>
            <RomList items={g.items} empty="" />
          </div>
        ))}
      </div>
    </Issue>
  );
}

function HashHealthView({ r }: { r: HashHealthReport }) {
  const t = useTranslations("maintenance.reportsPanel");
  const h = r.hashHealth;
  if (!h.datLoaded) {
    return (
      <div className="rounded-[4px] bg-[#23262e] px-4 py-3 text-[13px] text-dim ring-1 ring-white/5">
        {t("datNotLoaded")}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Issue title={t("badHashesTitle")} count={h.mismatch.count} tone="bad" cap={h.mismatch.items.length}>
        <RomList items={h.mismatch.items} empty={t("none")} />
      </Issue>
      <Issue title={t("unhashedTitle")} count={h.unhashed.count} cap={h.unhashed.items.length}>
        <RomList items={h.unhashed.items} empty={t("none")} />
      </Issue>
      <p className="text-[11px] text-dim">
        {t("hashSummary", {
          verified: h.verified.toLocaleString(),
          mismatch: h.mismatch.count.toLocaleString(),
          unknown: h.unknown.toLocaleString(),
          systems: h.coveredSystems,
        })}
      </p>
    </div>
  );
}

function ScrapeGapsView({ r }: { r: ScrapeGapsReport }) {
  const t = useTranslations("maintenance.reportsPanel");
  if (r.scrapeGaps.count === 0) return <p className="text-sm text-[#8ce05f]">{t("everythingScraped")}</p>;
  return (
    <>
      <p className="mb-2 text-[13px] text-dim">{t("gamesMissingMeta", { count: r.scrapeGaps.count.toLocaleString() })}</p>
      <div className="flex flex-wrap gap-2">
        {r.scrapeGaps.bySystem.map((g) => (
          <span key={g.slug} className="rounded-[3px] bg-[#23262e] px-3 py-1.5 text-[12px] text-body ring-1 ring-white/5">
            {g.name} <span className="text-[#e8c268]">{g.unscraped}</span>
          </span>
        ))}
      </div>
    </>
  );
}

function ResultView({ result }: { result: ReportResult }) {
  switch (result.id) {
    case "overview":
      return <OverviewView r={result.data as OverviewReport} />;
    case "most-played":
      return <MostPlayedView r={result.data as MostPlayedReport} />;
    case "missing":
      return <MissingView r={result.data as MissingReport} />;
    case "duplicates":
      return <DuplicatesView r={result.data as DuplicatesReport} />;
    case "hashes":
      return <HashHealthView r={result.data as HashHealthReport} />;
    case "scrape-gaps":
      return <ScrapeGapsView r={result.data as ScrapeGapsReport} />;
    default:
      return null;
  }
}

export default function ReportsPanel() {
  const t = useTranslations("maintenance.reportsPanel");
  const [reports, setReports] = useState<ReportMeta[] | null>(null);
  const [selected, setSelected] = useState<ReportId | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/reports", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setReports(d.reports ?? []))
      .catch(() => setReports([]));
  }, []);

  const run = useCallback(async (id: ReportId) => {
    setSelected(id);
    setResult(null);
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/reports?type=${id}`, { cache: "no-store" });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? t("failedToGenerate"));
        return;
      }
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <GpSubHeader>{t("reports")}</GpSubHeader>
        <p className="mb-3 text-[13px] text-dim">
          {t("pickReport")}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(reports ?? []).map((m) => (
            <button
              key={m.id}
              onClick={() => run(m.id)}
              className={`rounded-[4px] px-4 py-3 text-left ring-1 transition-colors ${
                selected === m.id
                  ? "bg-accent/15 ring-accent/50"
                  : "bg-[#23262e] ring-white/5 hover:bg-[#2a2e37]"
              }`}
            >
              <div className="flex items-center gap-2 text-[15px] text-body">
                {m.label}
                {m.slow && (
                  <span className="rounded-[3px] bg-[#e8c268]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#e8c268]">
                    {t("slower")}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[12px] text-dim">{m.description}</div>
            </button>
          ))}
          {reports === null && <p className="text-sm text-dim">{t("loading")}</p>}
        </div>
      </div>

      {selected && (
        <div>
          <div className="mb-3 flex items-center gap-3">
            <div className="mr-auto text-[13px] text-dim">
              {result && (
                <span suppressHydrationWarning>{t("generatedAt", { date: new Date(result.generatedAt).toLocaleString() })}</span>
              )}
            </div>
            <GpButton onClick={() => run(selected)} disabled={loading}>
              {loading ? t("generating") : t("refresh")}
            </GpButton>
            <a
              href={`/api/reports?type=${selected}&format=json`}
              className="btn-gray DialogButton Focusable cursor-pointer rounded-[2px] px-4 py-2 text-sm"
            >
              {t("downloadJson")}
            </a>
          </div>

          {error && <div className="rounded-[4px] bg-[#e0625f]/15 px-4 py-3 text-sm text-[#e0625f]">{error}</div>}
          {loading && !result && <p className="text-sm text-dim">{t("generatingReport")}</p>}
          {result && <ResultView result={result} />}
        </div>
      )}
    </div>
  );
}
