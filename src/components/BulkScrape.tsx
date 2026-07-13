"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ScrapeJobStatus } from "@/lib/providers/scrapeJob";
import { playSound } from "@/lib/sounds";
import { GpSubHeader, GpButton, GpModal } from "./bpm/primitives";

export interface ScrapeSystemOption {
  slug: string;
  name: string;
  count: number;
}

type ScrapeMode = "missing" | "all" | "backfill";

export default function BulkScrape({ systems }: { systems: ScrapeSystemOption[] }) {
  const t = useTranslations("scrapeTools");
  const [status, setStatus] = useState<ScrapeJobStatus | null>(null);
  const [modal, setModal] = useState<ScrapeMode | null>(null);
  const modalRef = useRef(modal);
  useEffect(() => {
    modalRef.current = modal;
  }, [modal]);
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  const running = status?.running ?? false;

  // Poll job status while running (and once on mount, so returning to this
  // page after navigating away picks the job right back up)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch("/api/scrape/job");
        const data: ScrapeJobStatus = await res.json();
        if (stopped) return;
        setStatus(data);
        // Progress itself lives on the Downloads page — here we only poll so the
        // page refreshes (new covers) when a job finishes.
        if (data.running) timer = setTimeout(poll, 2000);
        else router.refresh();
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

  // B / Escape closes the picker like every other overlay
  useEffect(() => {
    const onB = (e: Event) => {
      if (modalRef.current) {
        e.preventDefault();
        playSound("modalClose");
        setModal(null);
      }
    };
    window.addEventListener("gh-b", onB);
    return () => window.removeEventListener("gh-b", onB);
  }, []);

  function openModal(mode: ScrapeMode) {
    playSound("modalOpen");
    setSelected([]);
    setModal(mode);
  }

  function toggleSystem(slug: string) {
    // sound handled globally by SoundManager (role="checkbox")
    setSelected((cur) =>
      cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]
    );
  }

  async function start(mode: ScrapeMode, systemsToScrape?: string[]) {
    setMsg("");
    playSound("activate");
    setModal(null);
    const res = await fetch("/api/scrape/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        onlyMissing: mode === "missing",
        metadataOnly: mode === "backfill",
        systems: systemsToScrape?.length ? systemsToScrape : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? t("bulk.failedToStart"));
    } else if (data.queued) {
      setMsg(t("bulk.queued"));
    }
    setStatus(data);
  }

  const finished = status && !status.running && status.done > 0;

  return (
    <div>
      <GpSubHeader>{t("bulk.scrapeLibrary")}</GpSubHeader>
      <p className="mb-2 px-1 text-[13px] leading-relaxed text-dim">
        {t("bulk.intro")}
      </p>

      {running && (
        <div className="mb-2 rounded-[3px] bg-[#23262e] px-4 py-3 text-[13px] text-body">
          {t.rich("bulk.runningNotice", {
            link: (chunks) => (
              <a href="/downloads" className="text-accent hover:underline">{chunks}</a>
            ),
          })}
        </div>
      )}

      {/* Always available — starting one while a job runs just queues it. */}
      <div className="settings-row">
        <div className="min-w-0">
          <div className="text-[16px] text-body">{t("bulk.scrapeMissing")}</div>
          <div className="mt-1 text-[12px] text-dim">
            {t("bulk.scrapeMissingDesc")}
          </div>
        </div>
        <GpButton primary onClick={() => openModal("missing")}>
          {t("common.chooseSystems")}
        </GpButton>
      </div>
      <div className="settings-row">
        <div className="min-w-0">
          <div className="text-[16px] text-body">{t("bulk.scrapeEverything")}</div>
          <div className="mt-1 text-[12px] text-dim">
            {t("bulk.scrapeEverythingDesc")}
          </div>
        </div>
        <GpButton onClick={() => openModal("all")}>{t("common.chooseSystems")}</GpButton>
      </div>
      <div className="settings-row">
        <div className="min-w-0">
          <div className="text-[16px] text-body">{t("bulk.backfill")}</div>
          <div className="mt-1 text-[12px] text-dim">
            {t("bulk.backfillDesc")}
          </div>
        </div>
        <GpButton onClick={() => openModal("backfill")}>{t("common.chooseSystems")}</GpButton>
      </div>

      {finished && (
        <div className="mt-1 px-1 text-[13px] text-accent">
          {status!.cancelled ? t("bulk.cancelled") : t("bulk.finished")}:{" "}
          {t("bulk.gamesMatched", {
            succeeded: status!.succeeded.toLocaleString(),
            done: status!.done.toLocaleString(),
          })}
          {status!.finishedAt && ` · ${status!.finishedAt.slice(0, 16).replace("T", " ")}`}
        </div>
      )}
      {msg && <div className="mt-1 px-1 text-[13px] text-danger">{msg}</div>}

      {/* System picker — Steam-style modal selector (configured, non-hidden systems) */}
      {modal && (
        <GpModal
          title={
            modal === "missing"
              ? t("bulk.scrapeMissing")
              : modal === "backfill"
                ? t("bulk.backfill")
                : t("bulk.scrapeEverything")
          }
          onClose={() => setModal(null)}
          footer={
            <>
              <span className="mr-auto text-[12px] text-dim">
                {selected.length > 0
                  ? t("common.selectedCount", { count: selected.length })
                  : t("common.noneSelected")}
              </span>
              <GpButton onClick={() => setModal(null)}>{t("common.cancel")}</GpButton>
              <GpButton onClick={() => start(modal, selected)} disabled={selected.length === 0}>
                {t("common.scrapeSelected")}
              </GpButton>
              <GpButton primary onClick={() => start(modal)}>
                {t("common.scrapeAll")}
              </GpButton>
            </>
          }
        >
          <p className="pb-3 text-[13px] text-dim">
            {modal === "missing" ? (
              t("bulk.missingModalDesc")
            ) : modal === "backfill" ? (
              t("bulk.backfillModalDesc")
            ) : (
              t.rich("bulk.everythingModalDesc", {
                hl: (chunks) => <span className="text-[#e0a23a]">{chunks}</span>,
              })
            )}{" "}
            {t("common.pickSystems")}
          </p>
          {systems.length === 0 ? (
            <p className="py-4 text-[14px] text-dim">
              {t("bulk.noConfiguredSystems")}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 pb-2 sm:grid-cols-2">
              {systems.map((s) => {
                const on = selected.includes(s.slug);
                return (
                  <button
                    key={s.slug}
                    onClick={() => toggleSystem(s.slug)}
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
