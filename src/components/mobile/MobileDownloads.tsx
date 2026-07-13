"use client";

// Mobile downloads view — the phone counterpart of the desktop /downloads Deck
// hero. Polls /api/jobs and shows the active job as a themed hero with a live
// activity graph, main + per-game progress, throughput stats, then the Up Next
// (systems queued in this job) and Scheduled (jobs queued behind) lists and the
// provider request-limit strip. Reached from the top-bar job indicator.

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

interface SysProg {
  slug: string;
  total: number;
  done: number;
}
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

function eta(startedAt: string | null, done: number, total: number): string {
  if (!startedAt || done <= 0 || done >= total) return "";
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
  const rate = done / elapsed;
  if (!isFinite(rate) || rate <= 0) return "";
  const remain = Math.round((total - done) / rate);
  return `~${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, "0")} left`;
}

function Bar({ label, right, value, color = "bg-[#3a86ff]" }: { label: string; right: string; value: number; color?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[13px]">
        <span className="min-w-0 truncate text-body">{label}</span>
        <span className="ml-3 shrink-0 tabular-nums text-dim">{right}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/12">
        <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-widest text-dim">{label}</div>
      <div className="text-[15px] font-semibold tabular-nums text-bright">{value}</div>
    </div>
  );
}

export default function MobileDownloads() {
  const t = useTranslations("mobileDownloads");
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [queued, setQueued] = useState<QueuedView[]>([]);
  const [automatic, setAutomatic] = useState<AutoTask[]>([]);
  const [quota, setQuota] = useState<ProviderQuota[]>([]);
  const [series, setSeries] = useState<Record<string, number[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [, force] = useState(0);
  const lastDone = useRef<Record<string, number>>({});
  const hist = useRef<Record<string, number[]>>({});

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch("/api/jobs");
        if (res.ok && !stop) {
          const data = await res.json();
          const js: JobView[] = data.jobs ?? [];
          // Roll a per-kind throughput history from the done deltas between polls.
          // This MUST happen in the poll body, NOT inside a setState updater —
          // React's dev Strict Mode invokes updaters twice, and the second pass
          // would see lastDone already advanced and record a 0 delta (which is
          // exactly what zeroed the graph). We snapshot the ref into state below.
          for (const j of js) {
            if (j.running) {
              const prevDone = lastDone.current[j.kind] ?? j.done;
              const arr = (hist.current[j.kind] ?? []).concat(Math.max(0, j.done - prevDone));
              hist.current[j.kind] = arr.slice(-96);
              lastDone.current[j.kind] = j.done;
            } else {
              delete lastDone.current[j.kind];
              delete hist.current[j.kind];
            }
          }
          setSeries({ ...hist.current });
          setJobs(js);
          setQueued(data.queued ?? []);
          setAutomatic(data.automatic ?? []);
          setQuota(data.quota ?? []);
          setLoaded(true);
        }
      } catch {
        /* ignore */
      }
      if (!stop) timer = setTimeout(poll, POLL_MS);
    }
    poll();
    const tick = setInterval(() => force((n) => n + 1), 1000);
    return () => {
      stop = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, []);

  async function cancel(kind: "scan" | "scrape") {
    await fetch(kind === "scan" ? "/api/scan/job" : "/api/scrape/job", { method: "DELETE" });
  }

  const running = jobs
    .filter((j) => j.running)
    .sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  const active = running[0];

  const plat = active?.currentSystem ? platformBySlug(active.currentSystem) : null;
  const color = plat?.color ?? "#26303c";
  const curSys = active?.systemQueue.find((s) => s.slug === active.currentSystem);
  const upNext = active?.systemQueue.filter((s) => s.slug !== active.currentSystem && s.done < s.total) ?? [];
  const systemsDone = active?.systemQueue.filter((s) => s.done >= s.total).length ?? 0;
  const s = active ? series[active.kind] ?? [] : [];
  const throughput = s.length ? s[s.length - 1] * PER_MIN : 0;
  const peak = s.length ? Math.max(...s) * PER_MIN : 0;
  const unit = active?.kind === "scan" ? t("unitSystems") : t("unitGames");
  const etaStr = active ? eta(active.startedAt, active.done, active.total) : "";

  return (
    <div className="flex flex-col gap-5">
      {active ? (
      <>
      {/* Themed hero with the activity graph flowing along the bottom */}
      <div className="relative -mx-4 overflow-hidden" style={{ background: "#0b0f14", height: 190 }}>
        {active.systemHero ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={active.systemHero} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(11,15,20,0.35) 0%, rgba(11,15,20,0.2) 40%, #0b0f14 100%)" }} />
          </>
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${color}55 0%, ${color}22 45%, #0b0f14 100%)` }} />
            {plat && (
              <div className="pointer-events-none absolute right-[6%] top-1/2 -translate-y-1/2 scale-[1.4] opacity-20">
                <SystemIcon platform={plat} size="xl" />
              </div>
            )}
          </>
        )}

        {/* Activity graph: a fixed-height strip anchored to the bottom of the
            hero. Its own gradient (transparent → solid #0b0f14) is the element
            BACKGROUND, so the canvas child paints on top of a dark base and the
            bars/line always read — regardless of the hero art behind it. Fixed
            px height (not %) so the canvas is guaranteed a non-zero size. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{ height: 104, background: "linear-gradient(180deg, rgba(11,15,20,0) 0%, rgba(11,15,20,0.9) 45%, #0b0f14 100%)" }}
        >
          <ActivityGraph series={s} className="absolute inset-0 h-full w-full" />
        </div>

        {/* overlay text */}
        <div className="absolute inset-x-0 top-0 z-10 p-4">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-accent">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent/40 border-t-accent" />
            {active.label}
          </div>
          <div className="mt-1 truncate text-[26px] font-black leading-none text-white drop-shadow">
            {plat?.name ?? t("library")}
          </div>
          <div className="mt-1 truncate text-[12px] text-white/75">
            {active.kind === "scrape"
              ? active.current
                ? t("nowScraping", { current: active.current })
                : t("scrapingMetadata")
              : t("scanningFiles")}
          </div>
        </div>
      </div>

      {/* Stats + cancel */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Stat label={t("throughput")} value={t("perMin", { value: Math.round(throughput) })} />
          <Stat label={t("peak")} value={t("perMin", { value: Math.round(peak) })} />
          <Stat label={t("systems")} value={`${systemsDone} / ${active.systemQueue.length}`} />
          {active.kind === "scrape" && (active.concurrency ?? 1) > 1 && (
            <Stat label={t("parallel")} value={`${active.concurrency}×`} />
          )}
        </div>
        <button
          onClick={() => void cancel(active.kind)}
          className="shrink-0 rounded-[6px] bg-[#232a34] px-3 py-2 text-[12px] font-semibold text-body active:bg-[#c0392b]"
        >
          {t("cancel")}
        </button>
      </div>

      {/* Progress bars */}
      <div className="flex flex-col gap-3">
        <Bar
          label={active.kind === "scan" ? t("scanningFilesBar") : t("scrapingMetadataBar")}
          right={`${active.done.toLocaleString()} / ${active.total.toLocaleString()} ${unit}`}
          value={pct(active.done, active.total)}
        />
        {active.kind === "scrape" && active.gameProgress && (
          <Bar
            label={active.gameProgress.detail ?? gamePhaseLabel(active.gameProgress)}
            right={gamePhaseRight(active.gameProgress)}
            value={gamePhasePct(active.gameProgress)}
            color="bg-[#59bf40]"
          />
        )}
        {curSys && curSys.total > 1 && (
          <Bar
            label={t("currentSystem", { name: plat?.name ?? active.currentSystem })}
            right={`${pct(curSys.done, curSys.total)}%`}
            value={pct(curSys.done, curSys.total)}
            color="bg-[#59bf40]"
          />
        )}
        {etaStr && <div className="text-[12px] text-dim" suppressHydrationWarning>{etaStr}</div>}
        {active.quotaPaused && (
          <p className="text-[12px] text-[#e0a23a]">
            {t("quotaPaused")}
          </p>
        )}
      </div>

      {/* Up Next — the active job's remaining systems, then the scans/scrapes
          queued behind it (what runs after the current item). */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[15px] font-bold text-bright">
          {t("upNext")} <span className="text-dim">({upNext.length + queued.length})</span>
        </div>
        {upNext.length + queued.length === 0 ? (
          <p className="rounded-[10px] bg-[#1a1f27] px-4 py-3 text-[13px] text-dim">{t("nothingQueued")}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {upNext.map((sys) => {
              const p = platformBySlug(sys.slug);
              return (
                <div key={`sys-${sys.slug}`} className="flex items-center gap-3 rounded-[10px] bg-[#1a1f27] px-3 py-2.5 ring-1 ring-white/5">
                  {p ? <SystemIcon platform={p} size="md" /> : <div className="h-10 w-10 rounded bg-white/10" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-bright">{p?.name ?? sys.slug}</div>
                    <div className="text-[12px] text-dim">{sys.total > 1 ? t("sysGamesProgress", { done: sys.done, total: sys.total }) : t("queued")}</div>
                  </div>
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-dim">{t("next")}</span>
                </div>
              );
            })}
            {queued.map((j) => {
              const p = j.systems.length === 1 ? platformBySlug(j.systems[0]) : null;
              return (
                <div key={`job-${j.id}`} className="flex items-center gap-3 rounded-[10px] bg-[#1a1f27] px-3 py-2.5 ring-1 ring-white/5">
                  {p ? (
                    <SystemIcon platform={p} size="md" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-white/10 text-white/70">
                      {j.kind === "scan" ? "⟳" : "☁"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-bright">{j.label}</div>
                    <div className="truncate text-[12px] text-dim">{j.detail}</div>
                  </div>
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-dim">{t("queuedLabel")}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      ) : (
        <div className="rounded-[10px] bg-[#1a1f27] p-5 text-center text-[13px] text-dim">
          {loaded
            ? t("nothingRunning")
            : t("loading")}
        </div>
      )}

      {/* Scheduled — recurring automatic tasks (daily scan, backup, news) */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[15px] font-bold text-bright">
          {t("scheduled")} <span className="text-dim">({automatic.length})</span>
        </div>
        {automatic.length === 0 ? (
          <p className="rounded-[10px] bg-[#1a1f27] px-4 py-3 text-[13px] text-dim">{t("noRecurringTasks")}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {automatic.map((a) => (
              <div key={a.key} className="flex items-center gap-3 rounded-[10px] bg-[#1a1f27] px-3 py-2.5 ring-1 ring-white/5">
                <div className="flex h-10 w-10 items-center justify-center rounded bg-white/10 text-white/70">⏱</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-bright">{a.label}</div>
                  <div className="text-[12px] text-dim">{a.detail}</div>
                </div>
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-dim">{t("auto")}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {quota.length > 0 && <QuotaStrip quota={quota} />}
    </div>
  );
}
