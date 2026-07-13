"use client";

// Editor tool on the game page's RELATED tab: curate custom related games on
// top of the IGDB-derived ones. Add a link to any other game in the library
// (tagged with a relationship kind) or remove a previously-added one. Links are
// bidirectional — adding A→B shows the relation on both games. Changes persist
// via /api/roms/[id]/relations and re-render the tab with router.refresh().

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import type { CustomRelationRow } from "@/lib/db";

// value = the kind key RelatedContent groups by (must match its KIND_ORDER);
// label = i18n key for what the editor picks.
const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "Related", label: "manager.optRelated" },
  { value: "Series", label: "shared.sameSeries" },
  { value: "Remake", label: "manager.optRemake" },
  { value: "Remaster", label: "manager.optRemaster" },
  { value: "Port", label: "manager.optPort" },
  { value: "DLC", label: "manager.optDlc" },
  { value: "Expansion", label: "manager.optExpansion" },
  { value: "Mod", label: "manager.optMod" },
];

interface SearchRow {
  id: number;
  title: string;
  platform_slug: string;
  boxart_url: string | null;
}

export default function RelatedManager({
  romId,
  relations,
}: {
  romId: number;
  relations: CustomRelationRow[];
}) {
  const router = useRouter();
  const t = useTranslations("related");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("Related");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // Portal target guard — the modal renders into document.body so it escapes the
  // mobile chrome's blurred/transformed ancestors (a fixed element inside one is
  // clipped to it, not the viewport — same trap that broke the notifications sheet).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setResults([]);
  }, []);

  // Escape / controller-B close the modal (and swallow B so it doesn't navigate).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    const onB = (e: Event) => {
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("gh-b", onB);
    searchRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("gh-b", onB);
    };
  }, [open, close]);

  // Debounced library search; excludes the current game and anything already linked.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const linked = new Set(relations.map((r) => r.otherRomId));
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/library?q=${encodeURIComponent(term)}&limit=24`);
        const data = await res.json();
        const rows: SearchRow[] = (data?.rows ?? []).filter(
          (r: SearchRow) => r.id !== romId && !linked.has(r.id)
        );
        setResults(rows.slice(0, 20));
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, romId, relations]);

  async function add(relatedRomId: number) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/roms/${romId}/relations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relatedRomId, kind }),
      });
      if (res.ok) {
        playSound("confirm");
        setQ("");
        setResults([]);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(relId: number) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/roms/${romId}/relations?relId=${relId}`, { method: "DELETE" });
      if (res.ok) {
        playSound("back");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          playSound("activate");
          setOpen(true);
        }}
        className="Focusable mb-8 inline-flex cursor-pointer items-center gap-2 rounded-[2px] bg-[#3d4450] px-4 py-2 text-[13px] font-semibold text-white outline-none transition-colors hover:bg-[#464e5c] focus:ring-2 focus:ring-inset focus:ring-white"
      >
        <span className="text-[16px] leading-none">+</span> {t("manager.title")}
      </button>

      {mounted && open && createPortal(
        <div
          data-overlay="open"
          className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[6px]"
          onClick={close}
        >
          <div
            className="flex max-h-[85vh] w-[560px] max-w-full flex-col overflow-hidden rounded-[6px] bg-[#1b1f27] shadow-2xl ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
              <h3 className="text-[17px] font-bold text-bright">{t("manager.title")}</h3>
              <button
                onClick={close}
                aria-label={t("manager.close")}
                className="Focusable cursor-pointer rounded p-1 text-dim outline-none hover:text-bright focus:ring-2 focus:ring-white"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* Add */}
              <div className="mb-2 flex items-center gap-2">
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="Focusable shrink-0 cursor-pointer rounded-[3px] bg-[#2a2f3a] px-2.5 py-2 text-[13px] text-bright outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white"
                >
                  {KIND_OPTIONS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {t(k.label)}
                    </option>
                  ))}
                </select>
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("manager.searchPlaceholder")}
                  data-nav-allow
                  className="Focusable min-w-0 flex-1 rounded-[3px] bg-[#2a2f3a] px-3 py-2 text-[14px] text-bright outline-none ring-1 ring-white/10 placeholder:text-dim focus:ring-2 focus:ring-white"
                />
              </div>

              {results.length > 0 && (
                <div className="mb-4 max-h-56 overflow-y-auto rounded-[4px] ring-1 ring-white/10">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => add(r.id)}
                      disabled={busy}
                      className="Focusable flex w-full cursor-pointer items-center gap-3 border-b border-white/5 bg-[#23262e] px-3 py-2 text-left outline-none transition-colors last:border-0 hover:bg-[#2b2f38] focus:bg-[#2b2f38] disabled:opacity-50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.boxart_url ?? undefined}
                        alt=""
                        className="h-10 w-8 shrink-0 rounded-[2px] bg-[#0e141b] object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-[14px] text-bright">{r.title}</span>
                      <span className="shrink-0 text-[11px] uppercase tracking-wide text-dim">
                        {r.platform_slug}
                      </span>
                      <span className="shrink-0 text-[16px] leading-none text-accent">+</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Current custom relations */}
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-dim">
                {t("manager.customRelations", { count: relations.length })}
              </div>
              {relations.length === 0 ? (
                <div className="py-3 text-[13px] text-dim/80">
                  {t("manager.noneYet")}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {relations.map((rel) => (
                    <div
                      key={rel.id}
                      className="flex items-center gap-3 rounded-[4px] bg-[#23262e] px-3 py-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={rel.otherBoxart ?? undefined}
                        alt=""
                        className="h-10 w-8 shrink-0 rounded-[2px] bg-[#0e141b] object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-[14px] text-bright">
                        {rel.otherTitle}
                      </span>
                      <span className="shrink-0 rounded-[2px] bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-body">
                        {rel.kind}
                      </span>
                      <button
                        onClick={() => remove(rel.id)}
                        disabled={busy}
                        aria-label={t("manager.removeAria", { title: rel.otherTitle })}
                        className="Focusable shrink-0 cursor-pointer rounded p-1 text-dim outline-none transition-colors hover:text-[#e5544b] focus:ring-2 focus:ring-white disabled:opacity-50"
                      >
                        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m1 0v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
