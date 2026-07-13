"use client";

// GameHub's downloads page — full-screen, modeled on the Steam Deck's. A
// system-themed hero on the right with a continuously-scrolling activity graph
// flowing into it, stats + two progress bars on the left, then the per-system
// queue: Up Next (this job) and Scheduled (jobs queued behind).

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { platformBySlug } from "@/lib/platforms";
import SystemIcon from "@/components/SystemIcon";
import ActivityGraph from "@/components/bpm/ActivityGraph";
import {
  QuotaStrip,
  gamePhaseLabel,
  gamePhasePct,
  gamePhaseRight,
  type ProviderQuota,
  type GameProgress,
} from "@/components/QuotaStrip";

interface SysProg { slug: string; total: number; done: number }
interface JobView {
  kind: "scan" | "scrape";
  label: string;
  running: boolean;
  currentSystem: string;
  done: number;
  total: number;
  systemQueue: SysProg[];
  current?: string;
  startedAt: string | null;
  errors: string[];
  systemHero?: string | null;
  systemLogo?: string | null;
  concurrency?: number;
  quotaPaused?: boolean;
  gameProgress?: GameProgress | null;
}

interface QueuedView {
  id: number;
  kind: "scan" | "scrape";
  label: string;
  systems: string[];
  detail: string;
}

interface AutoTask {
  key: string;
  label: string;
  detail: string;
}

const POLL_MS = 1500;
const PER_MIN = 60000 / POLL_MS;

const pct = (d: number, t: number) => (t > 0 ? Math.min(100, Math.round((d / t) * 100)) : 0);

function eta(t: ReturnType<typeof useTranslations>, startedAt: string | null, done: number, total: number): string {
  if (!startedAt || done <= 0 || done >= total) return "";
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
  const rate = done / elapsed;
  if (!isFinite(rate) || rate <= 0) return "";
  const remain = Math.round((total - done) / rate);
  return t("etaRemaining", { time: `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, "0")}` });
}

function SectionHead({ title, count, right }: { title: string; count?: number; right?: string }) {
  return (
    <h2 className="mb-3 mt-8 flex items-center gap-2 text-[22px] font-semibold text-bright">
      {title}
      {count !== undefined && <span className="text-dim">({count})</span>}
      <span className="mx-3 h-px flex-1 bg-white/10" aria-hidden />
      {right && <span className="text-[12px] font-medium uppercase tracking-widest text-dim">{right}</span>}
    </h2>
  );
}

const BarsGlyph = () => (
  <svg viewBox="0 0 14 12" className="h-3 w-3.5" aria-hidden>
    <rect x="1" y="6" width="2.4" height="6" fill="#3a86ff" />
    <rect x="5.8" y="3" width="2.4" height="9" fill="#3a86ff" />
    <rect x="10.6" y="1" width="2.4" height="11" fill="#3a86ff" />
  </svg>
);
const LineGlyph = () => (
  <svg viewBox="0 0 16 12" className="h-3 w-4" aria-hidden>
    <path d="M1 8 L5 5 L9 7 L15 3" fill="none" stroke="#59bf40" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Stat({ label, value, legend }: { label: string; value: string; legend?: "bars" | "line" }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-dim">
        {legend === "bars" && <BarsGlyph />}
        {legend === "line" && <LineGlyph />}
        {label}
      </div>
      <div className="text-[18px] font-semibold tabular-nums text-bright">{value}</div>
    </div>
  );
}

function Bar({ label, value, valueRight, colorClass }: { label: string; value: number; valueRight: string; colorClass: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[15px] text-white">
        <span className="truncate">{label}</span>
        <span className="ml-3 shrink-0 text-[14px] tabular-nums text-dim">{valueRight}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
        <div className={`h-full rounded-full ${colorClass} transition-[width] duration-500`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function QueueRow({ icon, name, detail, tag }: { icon: React.ReactNode; name: string; detail: string; tag?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-[3px] bg-white/[0.03] px-4 py-3">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-semibold text-bright">{name}</div>
        <div className="text-[13px] text-dim">{detail}</div>
      </div>
      {tag && <span className="text-[12px] font-bold uppercase tracking-widest text-dim">{tag}</span>}
    </div>
  );
}

export default function DownloadsPage() {
  const t = useTranslations("downloads.page");
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [queued, setQueued] = useState<QueuedView[]>([]);
  const [automatic, setAutomatic] = useState<AutoTask[]>([]);
  const [quota, setQuota] = useState<ProviderQuota[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [, force] = useState(0);
  const hist = useRef<Record<string, number[]>>({});
  const lastDone = useRef<Record<string, number>>({});

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch("/api/jobs");
        if (res.ok && !stop) {
          const data = await res.json();
          const js: JobView[] = data.jobs ?? [];
          for (const j of js) {
            if (j.running) {
              const prev = lastDone.current[j.kind] ?? j.done;
              const arr = hist.current[j.kind] ?? [];
              arr.push(Math.max(0, j.done - prev));
              hist.current[j.kind] = arr.slice(-60);
              lastDone.current[j.kind] = j.done;
            } else {
              delete lastDone.current[j.kind];
              delete hist.current[j.kind];
            }
          }
          setJobs(js);
          setQueued(data.queued ?? []);
          setAutomatic(data.automatic ?? []);
          setQuota(data.quota ?? []);
          setLoaded(true);
        }
      } catch { /* ignore */ }
      if (!stop) timer = setTimeout(poll, POLL_MS);
    }
    poll();
    const tick = setInterval(() => force((n) => n + 1), 1000);
    return () => { stop = true; clearTimeout(timer); clearInterval(tick); };
  }, []);

  async function cancel(kind: "scan" | "scrape") {
    await fetch(kind === "scan" ? "/api/scan/job" : "/api/scrape/job", { method: "DELETE" });
  }

  const running = jobs
    .filter((j) => j.running)
    .sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  const active = running[0];

  const cur = active?.currentSystem ? platformBySlug(active.currentSystem) : null;
  const curSys = active?.systemQueue.find((s) => s.slug === active.currentSystem);
  const upNext = active?.systemQueue.filter((s) => s.slug !== active.currentSystem && s.done < s.total) ?? [];
  const systemsDone = active?.systemQueue.filter((s) => s.done >= s.total).length ?? 0;
  const series = active ? hist.current[active.kind] ?? [] : [];
  const throughput = series.length ? series[series.length - 1] * PER_MIN : 0;
  const peak = series.length ? Math.max(...series) * PER_MIN : 0;
  const unit = active?.kind === "scan" ? t("systems") : t("games");

  const pausedScrape = jobs.find((j) => j.kind === "scrape" && j.quotaPaused);
  const pauseReason = pausedScrape?.errors.find((e) => /limit reached/i.test(e));
  const color = cur?.color ?? "#26303c";

  return (
    <div className="w-full">
      {/* ── full-bleed hero (Deck layout) — shown only while a job is active.
             The queue (Up Next / Scheduled) + quota below ALWAYS render, so
             this page is useful even when nothing is running. ── */}
      {active ? (
      <section
        className="relative w-full overflow-hidden"
        style={{ background: "#0b0f14", minHeight: "clamp(340px, 46vh, 560px)" }}
      >
        {/* hero art (LEFT) — scraped system art if we have it, else color + glyph */}
        <div className="absolute inset-y-0 left-0 w-[62%]">
          {active.systemHero ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={active.systemHero} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0" style={{ background: `linear-gradient(75deg, #0b0f14 8%, transparent 55%), linear-gradient(90deg, transparent 55%, #0b0f14 100%)` }} />
            </>
          ) : (
            <>
              <div className="absolute inset-0" style={{ background: `linear-gradient(75deg, ${color}66 0%, ${color}2e 45%, #0b0f14 100%)` }} />
              {cur && (
                <div className="pointer-events-none absolute left-[3%] top-1/2 -translate-y-1/2 scale-[1.7] opacity-[0.16]">
                  <SystemIcon platform={cur} size="xl" />
                </div>
              )}
              <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, transparent 55%, #0b0f14 100%)" }} />
            </>
          )}
        </div>

        {/* scrolling activity graph — anchored to the BOTTOM of the hero,
            flowing right→left into the art (Steam-style) */}
        <div className="pointer-events-none absolute bottom-0 left-0 h-[46%] w-[62%]">
          <ActivityGraph series={series} className="h-full w-full" />
          {/* fade left edge (dissolving into the hero art) */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, #0b0f14 0%, transparent 22%, transparent 82%, #0b0f14 100%)" }} />
        </div>

        {/* LEFT text: name (top), current + MANAGING pill (bottom) */}
        <div className="absolute inset-y-0 left-0 z-10 flex w-[58%] flex-col justify-between p-8">
          <div>
            <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-widest text-accent">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/40 border-t-accent" />
              {active.label}
            </div>
            <div className="mt-2 text-[42px] font-black leading-none text-white drop-shadow">{cur?.name ?? t("library")}</div>
            <div className="mt-2 truncate text-[15px] text-white/75">
              {active.kind === "scrape"
                ? active.current ? t("nowScraping", { current: active.current }) : t("statusScraping")
                : t("statusScanning")}
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-[3px] bg-black/60 px-3 py-1.5 text-[13px] text-white">
            {t("managingFor")} <span className="font-semibold text-accent">{t("thisLibrary")}</span>
          </span>
        </div>

        {/* RIGHT: stats + progress + ETA + cancel */}
        <div className="absolute inset-y-0 right-0 z-10 flex w-[40%] min-w-[420px] flex-col justify-center gap-5 p-8">
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <Stat label={t("throughput")} value={`${Math.round(throughput)}/min`} legend="bars" />
            <Stat label={t("peak")} value={`${Math.round(peak)}/min`} legend="line" />
            <Stat label={t("systemsStat")} value={`${systemsDone} / ${active.systemQueue.length}`} />
            {active.kind === "scrape" && (active.concurrency ?? 1) > 1 && (
              <Stat label={t("parallel")} value={`${active.concurrency}×`} />
            )}
          </div>
          <Bar
            label={active.kind === "scan" ? t("scanningFiles") : t("scrapingMetadata")}
            value={pct(active.done, active.total)}
            valueRight={`${active.done} / ${active.total} ${unit}`}
            colorClass="bg-[#3a86ff]"
          />
          {/* Steam-style secondary bar: the current game's live sub-operation —
              provider + item + WebP conversion. */}
          {active.kind === "scrape" && active.gameProgress && (
            <Bar
              label={active.gameProgress.detail ?? gamePhaseLabel(active.gameProgress)}
              value={gamePhasePct(active.gameProgress)}
              valueRight={gamePhaseRight(active.gameProgress)}
              colorClass="bg-[#59bf40]"
            />
          )}
          {curSys && curSys.total > 1 && (
            <Bar
              label={t("currentSystem", { name: cur?.name ?? active.currentSystem })}
              value={pct(curSys.done, curSys.total)}
              valueRight={`${pct(curSys.done, curSys.total)}%`}
              colorClass="bg-[#59bf40]"
            />
          )}
          {active.kind === "scrape" && <QuotaStrip quota={quota} />}
          <div className="flex items-center justify-between gap-4">
            <span className="text-[13px] text-dim" suppressHydrationWarning>
              {eta(t, active.startedAt, active.done, active.total)}
            </span>
            <button
              onClick={() => void cancel(active.kind)}
              className="Focusable shrink-0 cursor-pointer rounded-[2px] bg-[#3d4450] px-5 py-2 text-[13px] font-semibold text-white outline-none transition-colors hover:bg-[#c0392b] focus:ring-2 focus:ring-inset focus:ring-white/70"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      </section>
      ) : (
        <div className="px-8 pt-10">
          <h1 className="text-[26px] font-bold text-bright">{t("manageDownloads")}</h1>
          {pauseReason ? (
            <p className="mt-2 text-[15px] text-[#e0a23a]">{t("scrapingPaused", { reason: pauseReason })}</p>
          ) : (
            <p className="mt-2 text-[15px] text-dim">
              {loaded
                ? t("nothingRunning")
                : t("loading")}
            </p>
          )}
        </div>
      )}

      {/* ── queue (always visible) ── */}
      <div className="px-8 pb-10">
        {/* Up Next — what runs after the current item: the active job's
            remaining systems first, then the scans/scrapes queued behind it. */}
        {(active || queued.length > 0) && (
          <>
            <SectionHead title={t("upNext")} count={upNext.length + queued.length} right={t("autoUpdatesEnabled")} />
            {upNext.length + queued.length === 0 ? (
              <p className="rounded-[3px] bg-white/[0.03] px-4 py-4 text-[14px] text-dim">{t("nothingQueued")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {upNext.map((s) => {
                  const p = platformBySlug(s.slug);
                  return (
                    <QueueRow
                      key={`sys-${s.slug}`}
                      icon={p ? <SystemIcon platform={p} size="md" /> : <div className="h-12 w-12 rounded bg-white/10" />}
                      name={p?.name ?? s.slug}
                      detail={`${active?.label ?? t("scan")} · ${s.total > 1 ? `${s.done} / ${s.total} ${t("games")}` : t("queued")}`}
                      tag={t("tagNext")}
                    />
                  );
                })}
                {queued.map((j) => {
                  const p = j.systems.length === 1 ? platformBySlug(j.systems[0]) : null;
                  return (
                    <QueueRow
                      key={`job-${j.id}`}
                      icon={
                        p ? (
                          <SystemIcon platform={p} size="md" />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded bg-white/10 text-white/70">
                            {j.kind === "scan" ? "⟳" : "☁"}
                          </div>
                        )
                      }
                      name={j.label}
                      detail={j.detail}
                      tag={t("tagQueued")}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Scheduled — recurring automatic tasks (daily scan, backup, news) */}
        <SectionHead title={t("scheduled")} count={automatic.length} />
        {automatic.length === 0 ? (
          <p className="rounded-[3px] bg-white/[0.03] px-4 py-4 text-[14px] text-dim">{t("noRecurring")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {automatic.map((a) => (
              <QueueRow
                key={a.key}
                icon={<div className="flex h-12 w-12 items-center justify-center rounded bg-white/10 text-white/70">⏱</div>}
                name={a.label}
                detail={a.detail}
                tag={t("tagAuto")}
              />
            ))}
          </div>
        )}

        {/* Provider request limits — always visible here unless already shown in
            the active scrape hero. */}
        {quota.length > 0 && (!active || active.kind !== "scrape") && (
          <div className="mt-8 max-w-2xl">
            <QuotaStrip quota={quota} />
          </div>
        )}
      </div>
    </div>
  );
}
