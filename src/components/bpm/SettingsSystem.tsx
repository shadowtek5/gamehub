"use client";

// Settings → System, built to the live inventory of Big Picture's System
// page (refs/steam-captures/settings-inventory.json): Updates, Beta
// Participation, System Settings, About, Hardware, Advanced — same sections,
// same row/control types, real GameHub data behind every row.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GpRow, GpSubHeader, GpToggle, GpButton, GpDropdown, GpInfoRow } from "./primitives";
import LegalNotices from "./LegalNotices";

interface SystemInfo {
  hostname: string;
  osName: string;
  platform: string;
  version: string;
  nodeVersion: string;
  uptimeSec: number;
  cpuName: string;
  cpuFrequencyMhz: number;
  cpuLogicalCores: number;
  ramBytes: number;
}

export default function SettingsSystem() {
  const t = useTranslations("settingsSysKb.system");
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [gpu, setGpu] = useState<string>("—");
  const [showLegal, setShowLegal] = useState(false);

  useEffect(() => {
    fetch("/api/user-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPrefs(d.settings ?? {}))
      .catch(() => {});
    fetch("/api/system-info", { cache: "no-store" })
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
    // the browser knows the GPU; the server doesn't
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      if (gl && ext) setGpu(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)));
    } catch {}
  }, []);

  function setPref(key: string, value: string) {
    setPrefs((p) => ({ ...p, [key]: value }));
    try {
      localStorage.setItem(`gh-${key}`, value);
    } catch {}
    void fetch("/api/user-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
  }

  function downloadReport() {
    const report = {
      generated: new Date().toISOString(),
      app: "GameHub",
      ...info,
      gpu,
      userAgent: navigator.userAgent,
      screen: `${screen.width}x${screen.height}`,
      prefs,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gamehub-system-report.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const clock24 = prefs["clock24"] === "on";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <GpSubHeader>{t("updatesHeader")}</GpSubHeader>
        <GpRow
          label={t("softwareUpdates")}
          description={info ? t("softwareUpdatesDesc", { version: info.version, nodeVersion: info.nodeVersion }) : "…"}
        >
          <GpButton onClick={() => window.open("https://hub.docker.com/r/shadowtek5/gamehub/tags", "_blank")}>
            {t("checkForUpdates")}
          </GpButton>
        </GpRow>
      </div>

      <div>
        <GpSubHeader>{t("betaHeader")}</GpSubHeader>
        <GpRow label={t("updateChannel")} description={t("updateChannelDesc")}>
          <GpDropdown
            value={prefs["channel"] ?? "stable"}
            options={[
              { value: "stable", label: t("channelStable") },
              { value: "dev", label: t("channelDev") },
            ]}
            onChange={(v) => setPref("channel", v)}
          />
        </GpRow>
      </div>

      <div>
        <GpSubHeader>{t("systemSettingsHeader")}</GpSubHeader>
        <GpRow label={t("clock24")} description={t("clock24Desc")}>
          <GpToggle on={clock24} onChange={(v) => setPref("clock24", v ? "on" : "off")} label={t("clock24")} />
        </GpRow>
      </div>

      <div>
        <GpSubHeader>{t("aboutHeader")}</GpSubHeader>
        <GpInfoRow label={t("hostname")} value={info?.hostname ?? "…"} />
        <GpInfoRow label={t("osName")} value={info?.osName ?? "…"} />
        <GpInfoRow label={t("gamehubVersion")} value={info?.version ?? "…"} />
        <GpInfoRow label={t("serverRuntime")} value={info?.nodeVersion ?? "…"} />
        <GpInfoRow
          label={t("uptime")}
          value={info ? `${Math.floor(info.uptimeSec / 3600)}h ${Math.floor((info.uptimeSec % 3600) / 60)}m` : "…"}
        />
      </div>

      <div>
        <GpSubHeader>{t("hardwareHeader")}</GpSubHeader>
        <GpInfoRow label={t("cpuName")} value={info?.cpuName ?? "…"} />
        <GpInfoRow
          label={t("cpuFrequency")}
          value={info ? `${(info.cpuFrequencyMhz / 1000).toFixed(2)} GHz` : "…"}
        />
        <GpInfoRow label={t("cpuLogicalCores")} value={info?.cpuLogicalCores ?? "…"} />
        <GpInfoRow
          label={t("ramSize")}
          value={info ? `${(info.ramBytes / 1024 ** 3).toFixed(1)} GB` : "…"}
        />
        <GpInfoRow label={t("videoCard")} value={gpu} />
      </div>

      <div>
        <GpSubHeader>{t("advancedHeader")}</GpSubHeader>
        <GpRow label={t("systemReport")} description={t("systemReportDesc")}>
          <GpButton onClick={downloadReport}>{t("createReport")}</GpButton>
        </GpRow>
      </div>

      <div>
        <GpSubHeader>{t("legalHeader")}</GpSubHeader>
        <GpRow
          label={t("legalNotices")}
          description={t("legalNoticesDesc")}
        >
          <GpButton onClick={() => setShowLegal(true)}>{t("view")}</GpButton>
        </GpRow>
      </div>

      {showLegal && <LegalNotices onClose={() => setShowLegal(false)} />}
    </div>
  );
}
