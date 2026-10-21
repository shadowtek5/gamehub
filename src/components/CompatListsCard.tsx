"use client";

// Settings › Maintenance › Compatibility lists: the official emulator lists (RPCS3, Vita3K,
// PCSX2) the game pages and cards use — when they were last downloaded, how many of your
// games each one matched, and a button to refresh them now (they also refresh weekly).

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GpButton, GpProgress } from "@/components/bpm/primitives";
import { playSound } from "@/lib/sounds";

interface Status {
  refreshedAt: string | null;
  running: boolean;
  phase: "idle" | "downloading" | "matching";
  done: number;
  total: number;
  errors: string[];
  sources: { source: string; emulator: string; entries: number; matched: number }[];
}

export default function CompatListsCard() {
  const t = useTranslations("maintenance.compatLists");
  const [s, setS] = useState<Status | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch("/api/maintenance/compat-lists", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Status;
        if (stopped) return;
        setS(data);
        if (data.running) timer = setTimeout(poll, 1500);
      } catch {}
    }
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [s?.running]);

  async function refresh(rematch: boolean) {
    playSound("activate");
    const res = await fetch("/api/maintenance/compat-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rematch }),
    });
    if (res.ok) setS(await res.json());
  }

  if (!s) return null;
  const when = s.refreshedAt ? new Date(s.refreshedAt).toLocaleString() : null;

  return (
    <div className="mb-1.5 rounded-[2px] bg-[#23262e] p-3">
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-[16px] text-body">{t("title")}</span>
          <span className="block text-xs text-dim">{t("desc")}</span>
        </span>
        <span className="flex shrink-0 gap-2">
          <GpButton onClick={() => void refresh(true)} disabled={s.running}>{t("rematch")}</GpButton>
          <GpButton onClick={() => void refresh(false)} disabled={s.running}>{t("refresh")}</GpButton>
        </span>
      </div>

      <div className="mt-3 grid gap-1.5 sm:grid-cols-3">
        {s.sources.map((src) => (
          <div key={src.source} className="rounded-[2px] bg-black/20 px-3 py-2">
            <div className="truncate text-[14px] text-body">{src.emulator}</div>
            <div className="text-xs text-dim">
              {src.entries > 0
                ? t("counts", { entries: src.entries.toLocaleString(), matched: src.matched.toLocaleString() })
                : t("notDownloaded")}
            </div>
          </div>
        ))}
      </div>

      {s.running ? (
        <div className="mt-3">
          <div className="mb-1 text-xs text-dim">
            {s.phase === "downloading" ? t("downloading") : t("matching", { done: s.done.toLocaleString(), total: s.total.toLocaleString() })}
          </div>
          <GpProgress value={s.total ? Math.round((s.done / s.total) * 100) : 0} />
        </div>
      ) : (
        <p className="mt-2 text-xs text-dim">{when ? t("updated", { when }) : t("never")}</p>
      )}
      {!s.running && s.errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-danger">
          {s.errors.slice(0, 5).map((e) => (
            <li key={e} className="truncate">✗ {e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
