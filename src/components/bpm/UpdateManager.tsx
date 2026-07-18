"use client";

// GameHub self-update manager (opened from Settings → System → Software
// Updates). Shared by desktop and mobile — SettingsSystem renders on both.
// The modal is portaled to <body> so the mobile chrome's blurred/transformed
// ancestors can't clip it (see AGENTS.md).

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { GpModal, GpRow, GpSubHeader, GpToggle, GpButton, GpDropdown, GpInfoRow } from "./primitives";

interface Available {
  version: string;
  tag: string;
  notesUrl: string;
  body: string;
  publishedAt: string;
  prerelease: boolean;
  checkedAt: string;
}
interface Status {
  supported: boolean;
  running: string;
  booted: string;
  image: string;
  staged: string | null;
  installed: string[];
  rollback: string | null;
  settings: { autoCheck: boolean; autoApply: boolean; channel: string; repo: string; intervalHours: number };
  lastCheck: string | null;
  available: Available | null;
  updateAvailable: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function UpdateManager({ onClose }: { onClose: () => void }) {
  const t = useTranslations("updateManager");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<null | "check" | "install" | "upload" | "apply" | "settings">(null);
  const [restarting, setRestarting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/update/status", { cache: "no-store" });
      if (r.ok) setStatus(await r.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const post = useCallback(
    async (path: string, init?: RequestInit) => {
      const r = await fetch(path, { method: "POST", ...init });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error === "notSupported" ? t("notSupportedShort") : data?.error || `HTTP ${r.status}`);
      return data;
    },
    [t]
  );

  async function waitForRestart() {
    setRestarting(true);
    await sleep(2000); // let the process exit first
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      try {
        const r = await fetch("/api/heartbeat", { cache: "no-store" });
        if (r.ok) {
          window.location.reload();
          return;
        }
      } catch {
        /* server down mid-restart — keep waiting */
      }
      await sleep(2500);
    }
    setRestarting(false);
    setMsg({ kind: "error", text: t("restartTimeout") });
  }

  async function onCheck() {
    setBusy("check");
    setMsg(null);
    try {
      const res = await post("/api/update/check");
      await refresh();
      setMsg(
        res.updateAvailable
          ? { kind: "info", text: t("updateAvailable", { version: res.latest?.version ?? "?" }) }
          : { kind: "info", text: t("upToDate") }
      );
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function onInstallLatest() {
    setBusy("install");
    setMsg(null);
    try {
      const res = await post("/api/update/install");
      await refresh();
      if (res.upToDate) setMsg({ kind: "info", text: t("upToDate") });
      else setMsg({ kind: "info", text: t("stagedReady", { version: res.staged }) });
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function onUpload(file: File) {
    setBusy("upload");
    setMsg(null);
    try {
      const res = await post("/api/update/upload", { body: file });
      await refresh();
      setMsg({ kind: "info", text: t("stagedReady", { version: res.staged }) });
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function onApply(version?: string) {
    setBusy("apply");
    setMsg(null);
    try {
      await post("/api/update/apply", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(version ? { version } : {}),
      });
      await waitForRestart();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
      setBusy(null);
    }
  }

  async function onRollback(version?: string) {
    setBusy("apply");
    setMsg(null);
    try {
      await post("/api/update/rollback", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(version ? { version } : {}),
      });
      await waitForRestart();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
      setBusy(null);
    }
  }

  async function saveSettings(patch: Partial<Status["settings"]>) {
    if (!status) return;
    setStatus({ ...status, settings: { ...status.settings, ...patch } });
    setBusy("settings");
    try {
      await post("/api/update/settings", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  const s = status;
  const anyBusy = busy !== null || restarting;

  const body = (
    <GpModal
      title={t("title")}
      onClose={restarting ? () => {} : onClose}
      width={760}
      footer={<GpButton onClick={onClose} disabled={restarting}>{t("close")}</GpButton>}
    >
      {restarting ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
          <div className="text-[16px] text-body">{t("restarting")}</div>
          <div className="text-[12px] text-dim">{t("restartingHint")}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* ---- current state ---- */}
          <div>
            <GpSubHeader>{t("statusHeader")}</GpSubHeader>
            <GpInfoRow label={t("runningVersion")} value={s?.running ?? "…"} />
            {s && s.booted === "image" ? (
              <GpInfoRow label={t("source")} value={t("sourceImage")} />
            ) : (
              <GpInfoRow label={t("source")} value={t("sourceStaged", { version: s?.booted ?? "" })} />
            )}
            <GpInfoRow label={t("fallbackFloor")} value={s?.image ?? "…"} />
            <GpInfoRow
              label={t("lastChecked")}
              value={s?.lastCheck ? new Date(s.lastCheck).toLocaleString() : t("never")}
            />
          </div>

          {msg && (
            <div
              className={`rounded px-3 py-2 text-[13px] ${
                msg.kind === "error" ? "bg-red-500/15 text-red-300" : "bg-white/10 text-body"
              }`}
            >
              {msg.text}
            </div>
          )}

          {/* ---- staged / apply ---- */}
          {s?.staged && (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="mb-2 text-[15px] font-semibold text-bright">{t("stagedReady", { version: s.staged })}</div>
              <div className="mb-3 text-[12px] text-dim">{t("stagedHint")}</div>
              <div className="flex gap-2">
                <GpButton primary onClick={() => onApply()} disabled={anyBusy}>
                  {busy === "apply" ? t("applying") : t("restartToApply")}
                </GpButton>
                <GpButton onClick={() => onRollback(s.rollback && s.rollback !== "image" ? s.rollback : undefined)} disabled={anyBusy}>
                  {t("discard")}
                </GpButton>
              </div>
            </div>
          )}

          {/* ---- check / install (Docker runtime only) ---- */}
          <div>
            <GpSubHeader>{t("updatesHeader")}</GpSubHeader>
            {s && !s.supported ? (
              <div className="text-[13px] text-dim">
                <p className="mb-2">{t("notSupportedDesc")}</p>
                <GpButton onClick={() => window.open(`https://github.com/${s.settings.repo}/releases`, "_blank")}>
                  {t("viewReleases")}
                </GpButton>
              </div>
            ) : (
              <>
                <GpRow
                  label={t("checkRow")}
                  description={
                    s?.available && s.updateAvailable
                      ? t("updateAvailable", { version: s.available.version })
                      : t("checkRowDesc")
                  }
                >
                  <div className="flex gap-2">
                    <GpButton onClick={onCheck} disabled={anyBusy}>
                      {busy === "check" ? t("checking") : t("checkNow")}
                    </GpButton>
                    {s?.updateAvailable && (
                      <GpButton primary onClick={onInstallLatest} disabled={anyBusy}>
                        {busy === "install" ? t("installing") : t("downloadInstall")}
                      </GpButton>
                    )}
                  </div>
                </GpRow>
                {s?.available && (
                  <GpRow label={t("releaseNotes")} description={s.available.tag}>
                    <GpButton onClick={() => window.open(s.available!.notesUrl, "_blank")}>{t("view")}</GpButton>
                  </GpRow>
                )}
                <GpRow label={t("uploadRow")} description={t("uploadRowDesc")}>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUpload(f);
                      e.target.value = "";
                    }}
                  />
                  <GpButton onClick={() => fileRef.current?.click()} disabled={anyBusy}>
                    {busy === "upload" ? t("uploading") : t("chooseZip")}
                  </GpButton>
                </GpRow>
              </>
            )}
          </div>

          {/* ---- auto-update preferences ---- */}
          {s?.supported && (
            <div>
              <GpSubHeader>{t("autoHeader")}</GpSubHeader>
              <GpRow label={t("autoCheck")} description={t("autoCheckDesc")}>
                <GpToggle on={s.settings.autoCheck} onChange={(v) => saveSettings({ autoCheck: v })} label={t("autoCheck")} />
              </GpRow>
              <GpRow label={t("autoApply")} description={t("autoApplyDesc")}>
                <GpToggle
                  on={s.settings.autoApply}
                  onChange={(v) => saveSettings({ autoApply: v })}
                  label={t("autoApply")}
                />
              </GpRow>
              <GpRow label={t("channel")} description={t("channelDesc")}>
                <GpDropdown
                  value={s.settings.channel}
                  options={[
                    { value: "stable", label: t("channelStable") },
                    { value: "beta", label: t("channelBeta") },
                  ]}
                  onChange={(v) => saveSettings({ channel: v })}
                />
              </GpRow>
              <GpRow label={t("interval")} description={t("intervalDesc")}>
                <GpDropdown
                  value={String(s.settings.intervalHours)}
                  options={[1, 3, 6, 12, 24].map((h) => ({ value: String(h), label: t("hours", { h }) }))}
                  onChange={(v) => saveSettings({ intervalHours: parseInt(v, 10) })}
                />
              </GpRow>
            </div>
          )}

          {/* ---- advanced: rollback + installed ---- */}
          {s?.supported && (s.installed.length > 0 || s.booted !== "image") && (
            <div>
              <GpSubHeader>{t("advancedHeader")}</GpSubHeader>
              <GpRow label={t("rollbackImage")} description={t("rollbackImageDesc", { version: s.image })}>
                <GpButton onClick={() => onRollback()} disabled={anyBusy || s.booted === "image"}>
                  {t("revert")}
                </GpButton>
              </GpRow>
              {s.installed.map((v) => (
                <GpInfoRow
                  key={v}
                  label={t("installedVersion", { version: v })}
                  value={
                    v === s.running ? (
                      <span className="text-[12px] text-dim">{t("current")}</span>
                    ) : (
                      <GpButton onClick={() => onApply(v)} disabled={anyBusy}>
                        {t("switchTo")}
                      </GpButton>
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </GpModal>
  );

  if (typeof document === "undefined") return body;
  return createPortal(body, document.body);
}
