"use client";

// Live system Activity Log viewer (admin-only). Shows what GameHub is doing and
// who triggered it — scans, scrapes, user/settings/maintenance events — newest
// first, refreshing on a poll. Backs both /activity (desktop) and
// /mobile/activity. Mirrors the self-rescheduling poll pattern from the
// Downloads page (src/app/downloads/page.tsx), but cursors by event id (?since)
// so each tick only pulls rows we don't already have.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { GpPill } from "@/components/bpm/primitives";

interface EventRow {
  id: number;
  created_at: string;
  category: string;
  action: string;
  severity: "info" | "warn" | "error";
  actor_id: number | null;
  actor_name: string | null;
  summary: string;
  detail: Record<string, unknown> | null;
}

const POLL_MS = 3000;

// Filter chips → the category value sent to the API (null = everything).
const FILTERS: { key: string; category: string | null }[] = [
  { key: "all", category: null },
  { key: "scan", category: "scan" },
  { key: "scrape", category: "scrape" },
  { key: "user", category: "user" },
  { key: "settings", category: "settings" },
  { key: "maintenance", category: "maintenance" },
];

// Per-category accent + glyph so the feed reads at a glance.
const CATEGORY_META: Record<string, { color: string; icon: string }> = {
  scan: { color: "#1a9fff", icon: "🔍" },
  scrape: { color: "#8f6fff", icon: "🖼️" },
  user: { color: "#59bf40", icon: "👤" },
  auth: { color: "#59bf40", icon: "🔑" },
  settings: { color: "#f0a020", icon: "⚙️" },
  maintenance: { color: "#e0873a", icon: "🧰" },
  system: { color: "#7a8794", icon: "🖥️" },
};

const SEVERITY_COLOR: Record<EventRow["severity"], string> = {
  info: "#59bf40",
  warn: "#f0a020",
  error: "#e5484d",
};

function timeAgo(
  iso: string,
  now: number,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  // stored timestamps are UTC "YYYY-MM-DD HH:MM:SS" (SQLite datetime('now'))
  const ms = now - new Date(iso.replace(" ", "T") + "Z").getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso.slice(0, 19).replace("T", " ");
  const s = Math.round(ms / 1000);
  if (s < 60) return t("secondsAgo", { s });
  const m = Math.round(s / 60);
  if (m < 60) return t("minutesAgo", { m });
  const h = Math.round(m / 60);
  if (h < 24) return t("hoursAgo", { h });
  const d = Math.round(h / 24);
  if (d < 7) return t("daysAgo", { d });
  return new Date(iso.replace(" ", "T") + "Z").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Relative time that is hydration-safe: renders the stable timestamp on the
 *  server + first paint, then upgrades to "x ago" and ticks every 15s. */
function Ago({ iso }: { iso: string }) {
  const t = useTranslations("activityComps.log");
  const [now, setNow] = useState(0);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return <>{now ? timeAgo(iso, now, t) : iso.slice(0, 19).replace("T", " ")}</>;
}

function EventItem({ row, mobile }: { row: EventRow; mobile: boolean }) {
  const t = useTranslations("activityComps.log");
  const [open, setOpen] = useState(false);
  const meta = CATEGORY_META[row.category] ?? CATEGORY_META.system;
  const catKey = CATEGORY_META[row.category] ? row.category : "system";
  const hasDetail = row.detail && Object.keys(row.detail).length > 0;
  return (
    <li className="deck-card overflow-hidden rounded-[6px] bg-white/[0.05] ring-1 ring-white/5">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={`flex w-full items-start gap-3 px-3.5 py-3 text-left ${hasDetail ? "cursor-pointer hover:bg-white/[0.03]" : "cursor-default"}`}
      >
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[14px]"
          style={{ background: `${meta.color}22` }}
          aria-hidden
        >
          {meta.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: SEVERITY_COLOR[row.severity] }}
              aria-hidden
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-dim">
              {t(`category.${catKey}`)}
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-dim/80">
              <Ago iso={row.created_at} />
            </span>
          </span>
          <span className={`mt-1 block ${mobile ? "text-[14px]" : "text-[15px]"} font-medium leading-snug text-bright`}>
            {row.summary}
          </span>
          <span className="mt-0.5 block text-[12px] text-dim">
            {row.actor_name ? t("byActor", { name: row.actor_name }) : t("automatic")}
            {hasDetail && <span className="ml-2 text-accent">{open ? t("hideDetails") : t("showDetails")}</span>}
          </span>
        </span>
      </button>
      {open && hasDetail && (
        <pre className="max-h-72 overflow-auto border-t border-white/10 bg-black/30 px-3.5 py-2.5 text-[11px] leading-relaxed text-body/80">
          {JSON.stringify(row.detail, null, 2)}
        </pre>
      )}
    </li>
  );
}

const CLEAR_SCOPES: { value: string; days: number | null }[] = [
  { value: "1", days: 1 },
  { value: "7", days: 7 },
  { value: "30", days: 30 },
  { value: "all", days: null },
];

// value → translation key for the human-readable scope label.
const SCOPE_LABEL_KEY: Record<string, string> = {
  "1": "clearScopeDay",
  "7": "clearScope7",
  "30": "clearScope30",
  all: "clearScopeAll",
};

export default function ActivityLog({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations("activityComps.log");
  const [filter, setFilter] = useState("all");
  const [live, setLive] = useState(true);
  const [counts, setCounts] = useState<{ total: number; byCategory: Record<string, number> }>({
    total: 0,
    byCategory: {},
  });
  const [clearScope, setClearScope] = useState("30");
  const [clearing, setClearing] = useState(false);
  // Bump to force the feed to remount + reload (after a clear).
  const [reloadKey, setReloadKey] = useState(0);
  const category = FILTERS.find((f) => f.key === filter)?.category ?? null;

  const chipCount = (f: (typeof FILTERS)[number]) =>
    f.category ? counts.byCategory[f.category] ?? 0 : counts.total;

  async function clearLogs() {
    const scope = CLEAR_SCOPES.find((s) => s.value === clearScope);
    if (!scope) return;
    const ok = window.confirm(
      scope.days == null
        ? t("confirmClearAll")
        : t("confirmClearScope", { scope: t(SCOPE_LABEL_KEY[scope.value]) })
    );
    if (!ok) return;
    setClearing(true);
    try {
      const q = scope.days == null ? "all=1" : `olderThanDays=${scope.days}`;
      const res = await fetch(`/api/activity/log?${q}`, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        if (data.counts) setCounts(data.counts);
        setReloadKey((n) => n + 1);
      }
    } catch {
      /* ignore */
    } finally {
      setClearing(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <GpPill
              key={f.key}
              active={filter === f.key}
              onClick={() => setFilter(f.key)}
              count={chipCount(f)}
            >
              {t(`filters.${f.key}`)}
            </GpPill>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLive((v) => !v)}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-[12px] font-semibold text-dim ring-1 ring-white/10 hover:text-bright"
          title={live ? t("pauseLive") : t("resumeLive")}
        >
          <span
            className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-[#59bf40]" : "bg-dim"}`}
            aria-hidden
          />
          {live ? t("live") : t("paused")}
        </button>
      </div>

      {/* Backup + retention controls. Logs also auto-purge after 30 days. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]">
        <button
          type="button"
          onClick={() => {
            // Trigger the attachment download without client-side navigation.
            const a = document.createElement("a");
            a.href = "/api/activity/log/export";
            a.download = "gamehub-activity-log.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
          }}
          className="rounded-full bg-white/5 px-3 py-1.5 font-semibold text-body ring-1 ring-white/10 hover:text-bright"
          title={t("exportTitle")}
        >
          {t("exportJson")}
        </button>
        <span className="ml-auto flex items-center gap-2 text-dim">
          <span>{t("clear")}</span>
          <select
            value={clearScope}
            onChange={(e) => setClearScope(e.target.value)}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-body focus:outline-none"
          >
            {CLEAR_SCOPES.map((s) => (
              <option key={s.value} value={s.value} className="bg-[#12161c]">
                {t(SCOPE_LABEL_KEY[s.value])}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={clearLogs}
            disabled={clearing}
            className="rounded-full bg-[#e5484d]/15 px-3 py-1.5 font-semibold text-[#ff8a8d] ring-1 ring-[#e5484d]/30 hover:bg-[#e5484d]/25 disabled:opacity-50"
          >
            {clearing ? t("clearing") : t("clear")}
          </button>
        </span>
      </div>

      {/* Keyed by category + reloadKey so switching filters or clearing remounts
          the feed — a clean reset of its rows/cursor without resetting state
          inside an effect. */}
      <Feed
        key={`${filter}:${reloadKey}`}
        category={category}
        live={live}
        mobile={mobile}
        onCounts={setCounts}
      />
    </div>
  );
}

function Feed({
  category,
  live,
  mobile,
  onCounts,
}: {
  category: string | null;
  live: boolean;
  mobile: boolean;
  onCounts: (c: { total: number; byCategory: Record<string, number> }) => void;
}) {
  const t = useTranslations("activityComps.log");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const catParam = category ? `&category=${category}` : "";

  // Newest id we hold — the poll cursor. A ref so the interval closure always
  // reads the latest without re-subscribing.
  const maxId = useRef(0);

  // Initial load. Runs once per mount (the parent remounts us on filter change).
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const res = await fetch(`/api/activity/log?limit=100${catParam}`);
        if (res.ok && !stop) {
          const data = await res.json();
          const rows: EventRow[] = data.events ?? [];
          setEvents(rows);
          maxId.current = rows[0]?.id ?? 0;
          setHasMore(rows.length >= 100);
          if (data.counts) onCounts(data.counts);
        }
      } catch {
        /* ignore */
      } finally {
        if (!stop) setLoaded(true);
      }
    })();
    return () => {
      stop = true;
    };
  }, [catParam, onCounts]);

  // Live tail: poll for rows newer than what we hold and prepend them.
  useEffect(() => {
    if (!live) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!document.hidden && maxId.current > 0) {
        try {
          const res = await fetch(`/api/activity/log?since=${maxId.current}${catParam}`);
          if (res.ok && !stop) {
            const data = await res.json();
            const rows: EventRow[] = data.events ?? [];
            if (rows.length) {
              maxId.current = rows[0].id;
              setEvents((prev) => [...rows, ...prev]);
            }
            if (data.counts) onCounts(data.counts);
          }
        } catch {
          /* ignore */
        }
      }
      if (!stop) timer = setTimeout(poll, POLL_MS);
    }
    timer = setTimeout(poll, POLL_MS);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [live, catParam, onCounts]);

  const loadOlder = useCallback(async () => {
    const oldest = events[events.length - 1]?.id;
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/activity/log?before=${oldest}&limit=100${catParam}`);
      if (res.ok) {
        const data = await res.json();
        const rows: EventRow[] = data.events ?? [];
        setEvents((prev) => [...prev, ...rows]);
        setHasMore(rows.length >= 100);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingOlder(false);
    }
  }, [events, loadingOlder, catParam]);

  if (!loaded) {
    return <p className="py-16 text-center text-sm text-dim">{t("loadingActivity")}</p>;
  }
  if (events.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-dim">
        {t("emptyState")}
      </p>
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-2">
        {events.map((e) => (
          <EventItem key={e.id} row={e} mobile={mobile} />
        ))}
      </ul>
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingOlder}
            className="rounded-full bg-white/5 px-5 py-2 text-[13px] font-semibold text-body ring-1 ring-white/10 hover:text-bright disabled:opacity-50"
          >
            {loadingOlder ? t("loadingOlder") : t("loadOlder")}
          </button>
        </div>
      )}
    </>
  );
}
