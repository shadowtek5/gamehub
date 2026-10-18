"use client";

import { GpButton, GpProgress, GpRow, GpToggle } from "@/components/bpm/primitives";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

interface VitaDecryptStatus {
  available: boolean;
  auto: boolean;
  running: boolean;
  total: number;
  done: number;
  decrypted: number;
  skipped: number;
  current: string;
  phase: string;
  errors: string[];
  cancelled: boolean;
  finishedAt: string | null;
}

/** Maintenance: decrypt raw PS Vita NoNpDRM dumps so clients can install them into Vita3K directly. */
export default function VitaDecryptCard() {
  const [job, setJob] = useState<VitaDecryptStatus | null>(null);
  const [msg, setMsg] = useState("");
  const t = useTranslations("maintenance.vitaDecrypt");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch("/api/maintenance/vita-decrypt", { cache: "no-store" });
        const data = await res.json();
        if (stopped) return;
        setJob(data);
        if (data.running) timer = setTimeout(poll, 2000);
      } catch {}
    }
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [job?.running]);

  async function post(body: object) {
    const res = await fetch("/api/maintenance/vita-decrypt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) setMsg(data.error ?? t("failedToStart"));
    else if (data.queued) setMsg(t("queued"));
    setJob(data);
  }

  async function toggleAuto() {
    const next = !job?.auto;
    playSound(next ? "toggleOn" : "toggleOff");
    setMsg("");
    await post({ auto: next });
  }

  async function run() {
    playSound("activate");
    setMsg("");
    await post({});
  }

  async function cancel() {
    const res = await fetch("/api/maintenance/vita-decrypt", { method: "DELETE" });
    setJob(await res.json());
  }

  if (!job) return null;

  return (
    <>
      <div className="mb-1.5 rounded-[2px] bg-[#23262e] p-3">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-[16px] text-body">{t("title")}</span>
            <span className="block text-xs text-dim">{job.available ? t("desc") : t("unavailable")}</span>
          </span>
          {job.running ? (
            <GpButton onClick={cancel} className="shrink-0">{t("cancel")}</GpButton>
          ) : (
            <GpButton onClick={run} disabled={!job.available} className="shrink-0">{t("run")}</GpButton>
          )}
        </div>
        {job.running && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-dim">
              <span className="min-w-0 truncate">
                {job.done.toLocaleString()}/{job.total.toLocaleString()}
                {job.current && ` — ${job.current}`}
                {job.phase && ` (${job.phase})`}
              </span>
              <span>{job.decrypted > 0 && t("decryptedCount", { count: job.decrypted })}</span>
            </div>
            <GpProgress value={job.total ? Math.round((job.done / job.total) * 100) : 0} />
          </div>
        )}
        {!job.running && job.finishedAt && job.done > 0 && (
          <p className="mt-2 text-xs text-accent">
            {job.cancelled ? t("cancelledPrefix") : "✓ "}
            {t("result", { decrypted: job.decrypted.toLocaleString(), skipped: job.skipped.toLocaleString() })}
          </p>
        )}
        {!job.running && job.errors.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-danger">
            {job.errors.slice(0, 5).map((e) => (
              <li key={e} className="truncate">✗ {e}</li>
            ))}
          </ul>
        )}
        {msg && <p className="mt-2 text-xs text-danger">{msg}</p>}
      </div>

      <GpRow label={t("auto")} description={t("autoDesc")}>
        <GpToggle on={job.auto} onChange={toggleAuto} label={t("auto")} />
      </GpRow>
    </>
  );
}
