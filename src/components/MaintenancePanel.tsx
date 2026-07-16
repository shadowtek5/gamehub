"use client";

import { GpProgress, GpConfirm, GpSubHeader, GpButton, GpRow, GpToggle, GpModal } from "@/components/bpm/primitives";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { playSound } from "@/lib/sounds";

interface HashJob {
  running: boolean;
  total: number;
  done: number;
  hashed: number;
  skipped: number;
  current: string;
}

interface SystemArtJob {
  running: boolean;
  total: number;
  done: number;
  updated: number;
  current: string;
  cancelled: boolean;
}

interface BoxartJob {
  running: boolean;
  total: number;
  processed: number;
  localized: number;
  optimized: number;
  cleared: number;
  failed: number;
  cancelled: boolean;
}

interface SystemOption {
  slug: string;
  name: string;
  count: number;
}

/** Which maintenance job the system picker is currently open for. */
type PickerJob = "hash" | "art" | "box" | "thumbs";

export default function MaintenancePanel({
  initialAutoScan,
  initialAutoCleanup = false,
  initialFsWatcher = false,
  lastAutoScan,
  systems = [],
}: {
  initialAutoScan: boolean;
  initialAutoCleanup?: boolean;
  initialFsWatcher?: boolean;
  lastAutoScan: string | null;
  /** configured, non-hidden systems (slug/name/count) for the run-scope picker */
  systems?: SystemOption[];
}) {
  const [autoScan, setAutoScan] = useState(initialAutoScan);
  const [autoCleanup, setAutoCleanup] = useState(initialAutoCleanup);
  const [fsWatcher, setFsWatcher] = useState(initialFsWatcher);
  const [hashJob, setHashJob] = useState<HashJob | null>(null);
  const [hashMsg, setHashMsg] = useState("");
  const [artJob, setArtJob] = useState<SystemArtJob | null>(null);
  const [artMsg, setArtMsg] = useState("");
  const [boxJob, setBoxJob] = useState<BoxartJob | null>(null);
  const [boxMsg, setBoxMsg] = useState("");
  const [thumbMsg, setThumbMsg] = useState("");
  const [picker, setPicker] = useState<PickerJob | null>(null);
  const [pickerSel, setPickerSel] = useState<string[]>([]);
  const [counts, setCounts] = useState<{ missing: number; orphanMedia: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [confirmingCleanup, setConfirmingCleanup] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const t = useTranslations("maintenance.maintenancePanel");

  useEffect(() => {
    fetch("/api/cleanup")
      .then((r) => r.json())
      .then((d) => setCounts({ missing: d.missing ?? 0, orphanMedia: d.orphanMedia ?? 0 }))
      .catch(() => {});
  }, []);

  async function toggleAutoScan() {
    const next = !autoScan;
    playSound(next ? "toggleOn" : "toggleOff");
    setAutoScan(next);
    await fetch("/api/settings/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoScan: next }),
    });
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch("/api/hash/job", { cache: "no-store" });
        const data = await res.json();
        if (stopped) return;
        setHashJob(data);
        if (data.running) timer = setTimeout(poll, 2000);
      } catch {}
    }
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [hashJob?.running]);

  async function startHashing(systems?: string[]) {
    playSound("activate");
    setHashMsg("");
    const res = await fetch("/api/hash/job", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systems }) });
    const data = await res.json();
    if (!res.ok) setHashMsg(data.error ?? t("failedToStart"));
    else if (data.queued) setHashMsg(t("jobQueued"));
    setHashJob(data);
  }

  async function cancelHashing() {
    const res = await fetch("/api/hash/job", { method: "DELETE" });
    setHashJob(await res.json());
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch("/api/systems/art-job", { cache: "no-store" });
        const data = await res.json();
        if (stopped) return;
        setArtJob(data);
        if (data.running) timer = setTimeout(poll, 2000);
      } catch {}
    }
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [artJob?.running]);

  async function startArtRescrape(systems?: string[]) {
    playSound("activate");
    setArtMsg("");
    const res = await fetch("/api/systems/art-job", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systems }) });
    const data = await res.json();
    if (!res.ok) setArtMsg(data.error ?? t("failedToStart"));
    else if (data.queued) setArtMsg(t("jobQueued"));
    setArtJob(data);
  }

  async function cancelArtRescrape() {
    const res = await fetch("/api/systems/art-job", { method: "DELETE" });
    setArtJob(await res.json());
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch("/api/maintenance/localize-boxart", { cache: "no-store" });
        const data = await res.json();
        if (stopped) return;
        setBoxJob(data);
        if (data.running) timer = setTimeout(poll, 2000);
      } catch {}
    }
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [boxJob?.running]);

  async function startLocalizeBoxart(systems?: string[]) {
    playSound("activate");
    setBoxMsg("");
    const res = await fetch("/api/maintenance/localize-boxart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systems }) });
    const data = await res.json();
    if (!res.ok) {
      setBoxMsg(data.error ?? t("failedToStart"));
      return;
    }
    // Runs through the downloads queue — if a scan/scrape is going it waits.
    if (data.queued) setBoxMsg(t("localizeQueued"));
    setBoxJob(data.status ?? null);
  }

  async function cancelLocalizeBoxart() {
    await fetch("/api/maintenance/localize-boxart", { method: "DELETE" });
  }

  async function refreshImages(systems?: string[], force = false) {
    playSound("activate");
    const res = await fetch("/api/systems/thumbs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systems, force }) });
    const data = await res.json().catch(() => ({}));
    setThumbMsg(!res.ok ? t("refreshFailed") : data.queued ? t("jobQueued") : t("refreshStarted"));
  }

  // ----- run-scope picker (choose systems, or run against everything) -----
  function openPicker(job: PickerJob) {
    playSound("modalOpen");
    setPickerSel([]);
    setPicker(job);
  }
  function togglePickSystem(slug: string) {
    setPickerSel((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));
  }
  function runPicker(systems?: string[]) {
    const job = picker;
    setPicker(null);
    if (!job) return;
    if (job === "hash") void startHashing(systems);
    else if (job === "art") void startArtRescrape(systems);
    else if (job === "box") void startLocalizeBoxart(systems);
    else if (job === "thumbs") void refreshImages(systems);
  }
  const PICKER_TITLE: Record<PickerJob, string> = {
    hash: t("computeHashes"),
    art: t("rescrapeArt"),
    box: t("localizeArt"),
    thumbs: t("refreshImages"),
  };

  async function toggleFsWatcher() {
    const next = !fsWatcher;
    playSound(next ? "toggleOn" : "toggleOff");
    setFsWatcher(next);
    await fetch("/api/settings/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fsWatcher: next }),
    });
  }

  async function toggleAutoCleanup() {
    const next = !autoCleanup;
    playSound(next ? "toggleOn" : "toggleOff");
    setAutoCleanup(next);
    await fetch("/api/settings/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoCleanup: next }),
    });
  }

  async function cleanup() {
    setBusy(true);
    setMsg(t("cleaning"));
    try {
      const res = await fetch("/api/cleanup", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        playSound("confirm");
        setMsg(t("removedSummary", { games: data.removedGames, folders: data.removedMediaFolders }));
        setCounts({ missing: 0, orphanMedia: 0 });
        router.refresh();
      } else {
        setMsg(`✗ ${data.error ?? t("failed")}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <GpSubHeader>{t("title")}</GpSubHeader>
      <p className="mb-4 text-[13px] text-dim">
        {t("intro")}
      </p>

      <GpRow
        label={t("dailyScan")}
        description={
          <>
            {t("dailyScanDesc")}
            {lastAutoScan && ` ${t("lastAutoScan", { date: lastAutoScan.slice(0, 16).replace("T", " ") })}`}
          </>
        }
      >
        <GpToggle on={autoScan} onChange={toggleAutoScan} label={t("dailyScan")} />
      </GpRow>

      <GpRow
        label={t("autoCleanup")}
        description={t("autoCleanupDesc")}
      >
        <GpToggle on={autoCleanup} onChange={toggleAutoCleanup} label={t("autoCleanup")} />
      </GpRow>

      <GpRow
        label={t("watchFolders")}
        description={t("watchFoldersDesc")}
      >
        <GpToggle on={fsWatcher} onChange={toggleFsWatcher} label={t("watchFolders")} />
      </GpRow>

      <div className="mb-1.5 rounded-[2px] bg-[#23262e] p-3">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-[16px] text-body">{t("computeHashes")}</span>
            <span className="block text-xs text-dim">
              {t("computeHashesDesc")}
            </span>
          </span>
          {hashJob?.running ? (
            <GpButton onClick={cancelHashing} className="shrink-0">{t("cancel")}</GpButton>
          ) : (
            <GpButton onClick={() => openPicker("hash")} className="shrink-0">{t("chooseSystems")}</GpButton>
          )}
        </div>
        {hashJob?.running && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-dim">
              <span className="min-w-0 truncate">
                {hashJob.done.toLocaleString()}/{hashJob.total.toLocaleString()}
                {hashJob.current && ` — ${hashJob.current}`}
              </span>
              <span>{hashJob.skipped > 0 && t("skipped", { count: hashJob.skipped })}</span>
            </div>
            <GpProgress value={hashJob.total ? Math.round((hashJob.done / hashJob.total) * 100) : 0} />
          </div>
        )}
        {!hashJob?.running && hashJob && hashJob.done > 0 && (
          <p className="mt-2 text-xs text-accent">
            {t("hashedFiles", { count: hashJob.hashed.toLocaleString() })}
            {hashJob.skipped > 0 && t("skippedTooLarge", { count: hashJob.skipped })}
          </p>
        )}
        {hashMsg && <p className="mt-2 text-xs text-danger">{hashMsg}</p>}
      </div>

      <div className="mb-1.5 rounded-[2px] bg-[#23262e] p-3">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-[16px] text-body">{t("rescrapeArt")}</span>
            <span className="block text-xs text-dim">
              {t("rescrapeArtDesc")}
            </span>
          </span>
          {artJob?.running ? (
            <GpButton onClick={cancelArtRescrape} className="shrink-0">{t("cancel")}</GpButton>
          ) : (
            <GpButton onClick={() => openPicker("art")} className="shrink-0">{t("chooseSystems")}</GpButton>
          )}
        </div>
        {artJob?.running && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-dim">
              <span className="min-w-0 truncate">
                {artJob.done.toLocaleString()}/{artJob.total.toLocaleString()}
                {artJob.current && ` — ${artJob.current}`}
              </span>
              <span>{artJob.updated > 0 && t("updated", { count: artJob.updated })}</span>
            </div>
            <GpProgress value={artJob.total ? Math.round((artJob.done / artJob.total) * 100) : 0} />
          </div>
        )}
        {!artJob?.running && artJob && artJob.done > 0 && (
          <p className="mt-2 text-xs text-accent">
            {artJob.cancelled ? t("cancelledPrefix") : "✓ "}
            {t("updatedSystems", { updated: artJob.updated.toLocaleString(), done: artJob.done.toLocaleString() })}
          </p>
        )}
        {artMsg && <p className="mt-2 text-xs text-danger">{artMsg}</p>}
      </div>

      <div className="mb-1.5 rounded-[2px] bg-[#23262e] p-3">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-[16px] text-body">{t("localizeArt")}</span>
            <span className="block text-xs text-dim">{t("localizeArtDesc")}</span>
          </span>
          {boxJob?.running ? (
            <GpButton onClick={cancelLocalizeBoxart} className="shrink-0">{t("cancel")}</GpButton>
          ) : (
            <GpButton onClick={() => openPicker("box")} className="shrink-0">{t("chooseSystems")}</GpButton>
          )}
        </div>
        {boxJob?.running && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-dim">
              <span className="min-w-0 truncate">
                {boxJob.processed.toLocaleString()}/{boxJob.total.toLocaleString()}
              </span>
              <span>{boxJob.localized > 0 && t("updated", { count: boxJob.localized })}</span>
            </div>
            <GpProgress value={boxJob.total ? Math.round((boxJob.processed / boxJob.total) * 100) : 0} />
          </div>
        )}
        {!boxJob?.running && boxJob && boxJob.processed > 0 && (
          <p className="mt-2 text-xs text-accent">
            {boxJob.cancelled ? t("cancelledPrefix") : ""}
            {t("localizeResult", {
              localized: boxJob.localized.toLocaleString(),
              optimized: boxJob.optimized.toLocaleString(),
              cleared: boxJob.cleared.toLocaleString(),
              failed: boxJob.failed,
            })}
          </p>
        )}
        {boxMsg && <p className="mt-2 text-xs text-danger">{boxMsg}</p>}
      </div>

      <GpRow
        label={t("refreshImages")}
        description={t("refreshImagesDesc")}
      >
        <div className="flex shrink-0 gap-2">
          <GpButton onClick={() => openPicker("thumbs")}>{t("chooseSystems")}</GpButton>
          <GpButton onClick={() => void refreshImages(undefined, true)}>{t("rebuildAllImages")}</GpButton>
        </div>
      </GpRow>
      {thumbMsg && <p className="mb-2 text-xs text-accent">{thumbMsg}</p>}

      <GpRow
        label={t("checkCleanup")}
        description={
          counts
            ? t("cleanupCounts", { missing: counts.missing, orphan: counts.orphanMedia })
            : t("checking")
        }
      >
        <GpButton
          onClick={() => setConfirmingCleanup(true)}
          disabled={busy || !counts || (counts.missing === 0 && counts.orphanMedia === 0)}
          className="shrink-0"
        >
          {busy ? t("cleaning") : t("cleanUp")}
        </GpButton>
      </GpRow>
      {msg && <p className="mt-3 text-sm text-accent">{msg}</p>}
      {confirmingCleanup && (
        <GpConfirm
          title={t("confirmTitle")}
          confirmLabel={t("remove")}
          danger
          onConfirm={() => void cleanup()}
          onClose={() => setConfirmingCleanup(false)}
        >
          {t("confirmBody", { missing: counts?.missing ?? 0, orphan: counts?.orphanMedia ?? 0 })}
        </GpConfirm>
      )}

      {/* Run-scope picker — pick systems, or run against the whole library. */}
      {picker && (
        <GpModal
          title={PICKER_TITLE[picker]}
          onClose={() => setPicker(null)}
          footer={
            <>
              <span className="mr-auto text-[12px] text-dim">
                {pickerSel.length > 0 ? t("selectedCount", { count: pickerSel.length }) : t("noneSelected")}
              </span>
              <GpButton onClick={() => setPicker(null)}>{t("cancel")}</GpButton>
              <GpButton onClick={() => runPicker(pickerSel)} disabled={pickerSel.length === 0}>
                {t("runSelected")}
              </GpButton>
              <GpButton primary onClick={() => runPicker()}>{t("runAll")}</GpButton>
            </>
          }
        >
          <p className="pb-3 text-[13px] text-dim">{t("pickSystemsHint")}</p>
          {systems.length === 0 ? (
            <p className="py-4 text-[14px] text-dim">{t("noConfiguredSystems")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 pb-2 sm:grid-cols-2">
              {systems.map((s) => {
                const on = pickerSel.includes(s.slug);
                return (
                  <button
                    key={s.slug}
                    onClick={() => togglePickSystem(s.slug)}
                    className={`Focusable flex cursor-pointer items-center gap-3 rounded-[2px] px-3 py-2.5 text-left ${
                      on ? "bg-[#3d4450] text-white" : "bg-black/20 text-body hover:bg-[#3d4450]"
                    }`}
                    role="checkbox"
                    aria-checked={on}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] text-xs font-bold ${
                        on ? "bg-white text-[#0e141b]" : "bg-black/40 ring-1 ring-white/25"
                      }`}
                      aria-hidden
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px]">{s.name}</span>
                    <span className="shrink-0 text-[12px] text-dim">{s.count.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          )}
        </GpModal>
      )}
    </div>
  );
}
