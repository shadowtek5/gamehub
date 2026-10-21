"use client";

// Settings › Firmware › Scan a folder (admins): point GameHub at a BIOS / firmware
// collection on the server and file everything it recognizes (see firmwareScan.ts).

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpButton, GpRow } from "@/components/bpm/primitives";

interface ScanStatus {
  running: boolean;
  root: string | null;
  done: number;
  total: number;
  current: string;
  bios: number;
  packages: number;
  already: number;
  found: string[];
  errors: string[];
  finishedAt: string | null;
  cancelled: boolean;
  savedPath: string | null;
}

export default function FirmwareScanPanel({ onFinished }: { onFinished: () => void }) {
  const t = useTranslations("firmwarePackages.scan");
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [path, setPath] = useState("");
  const [error, setError] = useState("");
  const [showFound, setShowFound] = useState(false);

  const poll = useCallback(async () => {
    const res = await fetch("/api/firmware/scan", { cache: "no-store" }).catch(() => null);
    if (!res || res.status === 401 || res.status === 403) {
      setAllowed(false);
      return null;
    }
    const s = (await res.json()) as ScanStatus;
    setStatus(s);
    setPath((cur) => cur || s.savedPath || "");
    return s;
  }, []);

  useEffect(() => {
    let alive = true;
    let wasRunning = false;
    const tick = async () => {
      const s = await poll();
      if (!alive) return;
      if (wasRunning && s && !s.running) {
        playSound("confirm");
        onFinished();
      }
      wasRunning = !!s?.running;
      setTimeout(tick, s?.running ? 1000 : 5000);
    };
    void tick();
    return () => {
      alive = false;
    };
  }, [poll, onFinished]);

  if (!allowed) return null;

  async function start() {
    setError("");
    const res = await fetch("/api/firmware/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? t("failed"));
      playSound("bumperEnd");
    } else {
      setStatus(data);
      playSound("confirm");
    }
  }

  async function stop() {
    await fetch("/api/firmware/scan", { method: "DELETE" });
    void poll();
  }

  const s = status;
  return (
    <GpRow label={t("title")} description={t("desc")}>
      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder={t("placeholder")}
            className="input-dark min-w-0 flex-1 rounded-[3px] px-3 py-2 font-mono text-[13px]"
          />
          {s?.running ? (
            <GpButton onClick={() => void stop()}>{t("stop")}</GpButton>
          ) : (
            <GpButton primary disabled={!path.trim()} onClick={() => void start()}>
              {t("start")}
            </GpButton>
          )}
        </div>
        {error && <div className="text-[12px] text-[#e0625f]">{error}</div>}
        {s?.running && (
          <div className="text-[12px] text-dim">
            {t("progress", { done: s.done, total: s.total })} <span className="font-mono">{s.current}</span>
          </div>
        )}
        {s && !s.running && s.finishedAt && (
          <div className="text-[12px] text-accent">
            {s.cancelled ? `${t("stopped")} ` : ""}
            {t("summary", { bios: s.bios, packages: s.packages, already: s.already })}
            {s.errors.length > 0 && <span className="text-[#e8c268]"> · {t("problems", { count: s.errors.length })}</span>}
          </div>
        )}
        {s && s.found.length > 0 && (
          <div>
            <button className="text-[12px] text-dim underline hover:text-bright" onClick={() => setShowFound((v) => !v)}>
              {showFound ? t("hideFound") : t("showFound", { count: s.found.length })}
            </button>
            {showFound && (
              <div className="mt-1 max-h-48 overflow-auto rounded-[3px] bg-black/25 p-2 font-mono text-[11px] text-dim">
                {s.found.map((line, i) => (
                  <div key={i} className="truncate">{line}</div>
                ))}
                {s.errors.map((line, i) => (
                  <div key={`e${i}`} className="truncate text-[#e8c268]">{line}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </GpRow>
  );
}
