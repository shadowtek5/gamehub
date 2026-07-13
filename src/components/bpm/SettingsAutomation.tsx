"use client";

// Automation admin panel: configure the schedules for the recurring background
// processes (library scan, cleanup, file watcher, news refresh, automated
// backup) and run any of them on demand. Auto-saves on change (no Save button),
// matching the rest of the BPM settings.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GpRow, GpToggle, GpDropdown, GpButton, GpSubHeader, GpCheck } from "./primitives";
import { playSound } from "@/lib/sounds";

interface BackupFile {
  name: string;
  size: number;
  mtime: string;
}
interface BackupStatus {
  enabled: boolean;
  intervalHours: number;
  dir: string;
  keep: number;
  parts: { saves: boolean; firmware: boolean; media: boolean; launchbox: boolean };
  running: boolean;
  lastAt: string | null;
  lastError: string | null;
  nextAt: string | null;
  backups: BackupFile[];
}
interface Automation {
  scan: { enabled: boolean; intervalHours: number; lastAt: string | null };
  cleanup: { enabled: boolean };
  watcher: { enabled: boolean };
  news: { enabled: boolean; intervalHours: number };
  backup: BackupStatus;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${u[i]}`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (ms < 0) {
    const d = Math.round(-ms / 3_600_000);
    return d >= 1 ? `in ~${d}h` : `in ~${Math.max(1, Math.round(-ms / 60_000))}m`;
  }
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function SettingsAutomation() {
  const [a, setA] = useState<Automation | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [dir, setDir] = useState("");
  const t = useTranslations("settingsAudioGroup.automation");

  const INTERVALS = [
    { value: "6", label: t("every6h") },
    { value: "12", label: t("every12h") },
    { value: "24", label: t("daily") },
    { value: "48", label: t("every2d") },
    { value: "168", label: t("weekly") },
  ];

  const KEEPS = ["3", "5", "7", "14", "30"].map((v) => ({ value: v, label: t("keep", { n: v }) }));

  async function load() {
    const res = await fetch("/api/settings/automation");
    if (res.ok) {
      const data = (await res.json()) as Automation;
      setA(data);
      setDir(data.backup.dir);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch("/api/settings/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      setA(data);
      if (data.backup?.dir) setDir(data.backup.dir);
    } else {
      setMsg(`✗ ${data.error ?? t("failed")}`);
    }
  }

  async function run(action: string, label: string) {
    setBusy(action);
    setMsg(`${label}…`);
    try {
      const res = await fetch("/api/settings/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run: action }),
      });
      const data = await res.json();
      if (res.ok) {
        playSound("toast");
        setMsg(data.message ?? `✓ ${label} ${t("done")}`);
        setA(data);
      } else {
        setMsg(`✗ ${data.error ?? t("failed")}`);
      }
    } finally {
      setBusy("");
    }
  }

  if (!a) return <div className="px-1 py-6 text-[14px] text-dim">{t("loading")}</div>;

  const b = a.backup;

  return (
    <div className="flex flex-col gap-2.5">
      <p className="px-1 text-[13px] leading-relaxed text-dim">
        {t("intro")}
      </p>

      {/* ---- Library scan ---- */}
      <GpSubHeader>{t("library")}</GpSubHeader>
      <GpRow
        label={t("autoScan")}
        description={t("autoScanDesc", { when: fmtWhen(a.scan.lastAt) })}
      >
        <div className="flex items-center gap-2">
          {a.scan.enabled && (
            <GpDropdown
              value={String(a.scan.intervalHours)}
              width={180}
              onChange={(v) => patch({ scanIntervalHours: Number(v) })}
              options={INTERVALS}
            />
          )}
          <GpToggle on={a.scan.enabled} onChange={(v) => patch({ scanEnabled: v })} label={t("autoScanToggle")} />
        </div>
      </GpRow>
      <GpRow label={t("autoClean")} description={t("autoCleanDesc")}>
        <GpToggle on={a.cleanup.enabled} onChange={(v) => patch({ cleanupEnabled: v })} label={t("autoCleanToggle")} />
      </GpRow>
      <GpRow label={t("watchFolders")} description={t("watchFoldersDesc")}>
        <GpToggle on={a.watcher.enabled} onChange={(v) => patch({ watcherEnabled: v })} label={t("watcherToggle")} />
      </GpRow>
      <div className="flex flex-wrap gap-2 px-1">
        <GpButton onClick={() => run("scan", t("queuingScan"))}>{t("scanNow")}</GpButton>
        <GpButton onClick={() => run("cleanup", t("cleaningUp"))}>{t("cleanUpNow")}</GpButton>
      </div>

      {/* ---- News ---- */}
      <GpSubHeader>{t("news")}</GpSubHeader>
      <GpRow
        label={t("newsRefresh")}
        description={
          a.news.enabled
            ? t("newsRefreshDesc")
            : t("newsRefreshNoFeeds")
        }
      >
        <div className="flex items-center gap-2">
          {a.news.enabled && (
            <GpDropdown
              value={String(a.news.intervalHours)}
              width={180}
              onChange={(v) => patch({ newsIntervalHours: Number(v) })}
              options={INTERVALS}
            />
          )}
          <GpButton onClick={() => run("news", t("refreshingNews"))} disabled={!a.news.enabled || busy === "news"}>
            {t("refreshNow")}
          </GpButton>
        </div>
      </GpRow>

      {/* ---- Automated backup ---- */}
      <GpSubHeader>{t("automatedBackup")}</GpSubHeader>
      <GpRow
        label={t("scheduledBackups")}
        description={
          b.lastAt
            ? `${t("backupLast", { when: fmtWhen(b.lastAt) })}${b.nextAt ? t("backupNext", { when: fmtWhen(b.nextAt) }) : ""}`
            : t("backupDescDefault")
        }
      >
        <div className="flex items-center gap-2">
          {b.enabled && (
            <GpDropdown
              value={String(b.intervalHours)}
              width={180}
              onChange={(v) => patch({ backup: { intervalHours: Number(v) } })}
              options={INTERVALS}
            />
          )}
          <GpToggle on={b.enabled} onChange={(v) => patch({ backup: { enabled: v } })} label={t("automatedBackup")} />
        </div>
      </GpRow>

      {b.enabled && (
        <div className="flex flex-col gap-3 rounded-[3px] bg-[#22262c] px-6 py-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-widest text-dim">{t("destinationFolder")}</span>
            <input
              className="input-dark w-full px-3 py-2 text-sm"
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              onBlur={() => dir.trim() && dir !== b.dir && patch({ backup: { dir } })}
              placeholder="data/backups"
            />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-dim">{t("retention")}</span>
              <GpDropdown
                value={String(b.keep)}
                width={130}
                onChange={(v) => patch({ backup: { keep: Number(v) } })}
                options={KEEPS}
              />
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-dim">{t("include")}</div>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <GpCheck checked={b.parts.saves} onChange={(v) => patch({ backup: { parts: { ...b.parts, saves: v } } })} label={t("saveStates")} />
              <GpCheck checked={b.parts.firmware} onChange={(v) => patch({ backup: { parts: { ...b.parts, firmware: v } } })} label={t("firmware")} />
              <GpCheck checked={b.parts.launchbox} onChange={(v) => patch({ backup: { parts: { ...b.parts, launchbox: v } } })} label={t("launchboxDb")} />
              <GpCheck checked={b.parts.media} onChange={(v) => patch({ backup: { parts: { ...b.parts, media: v } } })} label={t("media")} />
            </div>
            <p className="mt-1 text-[12px] text-dim">{t("dbAlwaysIncluded")}</p>
          </div>
          {b.lastError && <p className="text-[13px] text-danger">{t("backupFailed", { error: b.lastError })}</p>}
          {b.backups.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-dim">
                {t("existingBackups", { count: b.backups.length })}
              </div>
              <div className="flex flex-col gap-1">
                {b.backups.map((f) => (
                  <div key={f.name} className="flex items-center justify-between gap-3 rounded-[3px] bg-black/25 px-3 py-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-body">{f.name}</span>
                    <span className="shrink-0 text-dim">{fmtBytes(f.size)}</span>
                    <span className="shrink-0 text-dim">{fmtWhen(f.mtime)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="px-1">
        <GpButton primary onClick={() => run("backup", t("backingUpLabel"))} disabled={busy === "backup" || b.running}>
          {b.running || busy === "backup" ? t("backingUp") : t("backUpNow")}
        </GpButton>
      </div>

      {msg && <p className="px-1 text-[13px] text-accent">{msg}</p>}
    </div>
  );
}
