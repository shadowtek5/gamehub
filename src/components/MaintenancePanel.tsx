"use client";

import { GpProgress, GpConfirm, GpSubHeader, GpButton, GpRow, GpToggle } from "@/components/bpm/primitives";

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

export default function MaintenancePanel({
  initialAutoScan,
  initialAutoCleanup = false,
  initialFsWatcher = false,
  lastAutoScan,
}: {
  initialAutoScan: boolean;
  initialAutoCleanup?: boolean;
  initialFsWatcher?: boolean;
  lastAutoScan: string | null;
}) {
  const [autoScan, setAutoScan] = useState(initialAutoScan);
  const [autoCleanup, setAutoCleanup] = useState(initialAutoCleanup);
  const [fsWatcher, setFsWatcher] = useState(initialFsWatcher);
  const [hashJob, setHashJob] = useState<HashJob | null>(null);
  const [hashMsg, setHashMsg] = useState("");
  const [artJob, setArtJob] = useState<SystemArtJob | null>(null);
  const [artMsg, setArtMsg] = useState("");
  const [thumbMsg, setThumbMsg] = useState("");
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

  async function startHashing() {
    playSound("activate");
    setHashMsg("");
    const res = await fetch("/api/hash/job", { method: "POST" });
    const data = await res.json();
    if (!res.ok) setHashMsg(data.error ?? t("failedToStart"));
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

  async function startArtRescrape() {
    playSound("activate");
    setArtMsg("");
    const res = await fetch("/api/systems/art-job", { method: "POST" });
    const data = await res.json();
    if (!res.ok) setArtMsg(data.error ?? t("failedToStart"));
    setArtJob(data);
  }

  async function cancelArtRescrape() {
    const res = await fetch("/api/systems/art-job", { method: "DELETE" });
    setArtJob(await res.json());
  }

  async function refreshImages() {
    playSound("activate");
    const res = await fetch("/api/systems/thumbs", { method: "POST" });
    setThumbMsg(res.ok ? t("refreshStarted") : t("refreshFailed"));
  }

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
            <GpButton onClick={startHashing} className="shrink-0">{t("startHashing")}</GpButton>
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
            <GpButton onClick={startArtRescrape} className="shrink-0">{t("rescrapeAll")}</GpButton>
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

      <GpRow
        label={t("refreshImages")}
        description={t("refreshImagesDesc")}
      >
        <GpButton onClick={refreshImages} className="shrink-0">{t("refreshImagesBtn")}</GpButton>
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
    </div>
  );
}
