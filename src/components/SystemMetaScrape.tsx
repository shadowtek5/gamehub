"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpSubHeader, GpButton, GpModal } from "./bpm/primitives";
import type { ScrapeSystemOption } from "./BulkScrape";

type Mode = "meta" | "art";

const MODES: Record<
  Mode,
  { endpoint: string; titleKey: string; blurbKey: string; doneKey: string }
> = {
  meta: {
    endpoint: "/api/settings/systems/scrape-meta",
    titleKey: "systemMeta.metaTitle",
    blurbKey: "systemMeta.metaBlurb",
    doneKey: "systemMeta.metaDone",
  },
  art: {
    endpoint: "/api/settings/systems/scrape-art",
    titleKey: "systemMeta.artTitle",
    blurbKey: "systemMeta.artBlurb",
    doneKey: "systemMeta.artDone",
  },
};

// Settings → Scraping: scrape console metadata and/or artwork for chosen
// systems. Mirrors the game BulkScrape picker; artwork always forces so a
// manual scrape replaces whatever is stored.
export default function SystemMetaScrape({ systems }: { systems: ScrapeSystemOption[] }) {
  const t = useTranslations("scrapeTools");
  const [busy, setBusy] = useState<Mode | "">("");
  const [msg, setMsg] = useState("");
  const [modal, setModal] = useState<Mode | null>(null);
  const modalRef = useRef(modal);
  useEffect(() => {
    modalRef.current = modal;
  }, [modal]);
  const [selected, setSelected] = useState<string[]>([]);
  const router = useRouter();

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

  function openModal(mode: Mode) {
    playSound("modalOpen");
    setSelected([]);
    setModal(mode);
  }

  function toggleSystem(slug: string) {
    setSelected((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));
  }

  async function scrape(mode: Mode, systemsToScrape?: string[]) {
    const m = MODES[mode];
    playSound("activate");
    setModal(null);
    setBusy(mode);
    setMsg(`${t(m.titleKey)}…`);
    try {
      const res = await fetch(m.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systems: systemsToScrape?.length ? systemsToScrape : undefined }),
      });
      const data = await res.json();
      const n = data.updated ?? data.scraped ?? 0;
      setMsg(res.ok ? t(m.doneKey, { count: n }) : (data.error ?? t("systemMeta.scrapeFailed")));
      if (res.ok && n > 0) router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("systemMeta.failed"));
    } finally {
      setBusy("");
    }
  }

  const row = (mode: Mode) => (
    <div className="settings-row">
      <div className="min-w-0">
        <div className="text-[16px] text-body">{t(MODES[mode].titleKey)}</div>
        <div className="mt-1 text-[12px] text-dim">{t(MODES[mode].blurbKey)}</div>
      </div>
      <GpButton primary onClick={() => openModal(mode)} disabled={busy !== ""}>
        {busy === mode ? t("common.scraping") : t("common.chooseSystems")}
      </GpButton>
    </div>
  );

  return (
    <div>
      <GpSubHeader>{t("systemMeta.systems")}</GpSubHeader>
      {row("meta")}
      {row("art")}
      {msg && <div className="mt-1 px-1 text-[13px] text-accent">{msg}</div>}

      {/* System picker — same Steam-style modal as the game scrape */}
      {modal && (
        <GpModal
          title={t(MODES[modal].titleKey)}
          onClose={() => setModal(null)}
          footer={
            <>
              <span className="mr-auto text-[12px] text-dim">
                {selected.length > 0
                  ? t("common.selectedCount", { count: selected.length })
                  : t("common.noneSelected")}
              </span>
              <GpButton onClick={() => setModal(null)}>{t("common.cancel")}</GpButton>
              <GpButton onClick={() => scrape(modal, selected)} disabled={selected.length === 0}>
                {t("common.scrapeSelected")}
              </GpButton>
              <GpButton primary onClick={() => scrape(modal)}>
                {t("common.scrapeAll")}
              </GpButton>
            </>
          }
        >
          <p className="pb-3 text-[13px] text-dim">
            {t(MODES[modal].blurbKey)} {t("common.pickSystems")}
          </p>
          {systems.length === 0 ? (
            <p className="py-4 text-[14px] text-dim">{t("systemMeta.noSystems")}</p>
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
