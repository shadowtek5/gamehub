"use client";

// LaunchBox Games Database — steamified as a settings section: a subheader,
// one status row with an Import/Re-import button, and inline Steam-style
// progress while the ~500MB download + import runs. Same /api/providers/
// launchbox endpoints.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { LbImportStatus } from "@/lib/providers/launchbox";
import { playSound } from "@/lib/sounds";
import { GpSubHeader, GpButton, GpProgress } from "./primitives";

interface LbState {
  status: { games: number; images: number; platforms: number; importedAt: string | null };
  import: LbImportStatus;
}

export default function SettingsLaunchBox() {
  const t = useTranslations("settingsSysKb.launchBox");
  const [state, setState] = useState<LbState | null>(null);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const running = state?.import.running ?? false;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch("/api/providers/launchbox", { cache: "no-store" });
        const data: LbState = await res.json();
        if (stopped) return;
        setState(data);
        if (data.import.running) timer = setTimeout(poll, 1500);
        else if (data.import.phase === "done") router.refresh();
      } catch {
        if (!stopped) timer = setTimeout(poll, 5000);
      }
    }
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  async function startImport() {
    playSound("activate");
    setMsg("");
    const res = await fetch("/api/providers/launchbox", { method: "POST" });
    const data = await res.json();
    if (!res.ok) setMsg(data.error ?? t("failedToStart"));
    else setState((cur) => (cur ? { ...cur, import: data.import } : cur));
  }

  const imported = (state?.status.games ?? 0) > 0;
  const imp = state?.import;
  const dlPct = imp && imp.totalBytes > 0 ? Math.round((imp.bytes / imp.totalBytes) * 100) : 0;

  return (
    <div>
      <GpSubHeader>{t("dbHeader")}</GpSubHeader>
      <p className="mb-2 px-1 text-[13px] leading-relaxed text-dim">
        {t("aboutBefore")} <span className="text-body">Metadata.zip</span> {t("aboutAfter")}
      </p>
      <div className="settings-row">
        <div className="min-w-0">
          <div className="text-[16px] text-body">{t("offlineDbLabel")}</div>
          <div className="mt-1 text-[12px] text-dim">
            {imported && !running
              ? `${t("importedStatus", {
                  games: state!.status.games,
                  images: state!.status.images,
                  systems: state!.status.platforms,
                })}${
                  state!.status.importedAt ? t("lastUpdated", { date: state!.status.importedAt.slice(0, 10) }) : ""
                }`
              : t("notImported")}
          </div>
        </div>
        {!running && (
          <GpButton primary onClick={startImport}>
            {imported ? t("reimport") : t("downloadImport")}
          </GpButton>
        )}
      </div>

      {running && imp && (
        <div className="rounded-[3px] bg-[#23262e] p-4">
          <div className="mb-2 text-[13px] text-body">
            {imp.phase === "downloading"
              ? t("downloading", {
                  done: (imp.bytes / 1048576).toFixed(0),
                  total: imp.totalBytes ? ` / ${(imp.totalBytes / 1048576).toFixed(0)}` : "",
                  pct: imp.totalBytes ? ` (${dlPct}%)` : "",
                })
              : t("importing", {
                  games: imp.games,
                  images: imp.images,
                  systems: imp.platforms,
                })}
          </div>
          <GpProgress value={imp.phase === "downloading" ? dlPct : 100} />
        </div>
      )}

      {imp?.phase === "error" && <div className="px-1 text-[13px] text-danger">✗ {imp.error ?? t("importFailed")}</div>}
      {msg && <div className="px-1 text-[13px] text-danger">{msg}</div>}
    </div>
  );
}
