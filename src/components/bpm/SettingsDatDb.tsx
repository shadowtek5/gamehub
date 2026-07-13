"use client";

// No-Intro / Redump / MAME hash database — steamified like SettingsLaunchBox:
// a subheader, one status row with an Import/Re-import button, and inline
// Steam-style progress while the DAT files download + parse. Uses the
// /api/providers/datdb endpoints.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { DatImportStatus } from "@/lib/providers/datdb";
import { playSound } from "@/lib/sounds";
import { GpSubHeader, GpButton, GpProgress, GpCheck } from "./primitives";

interface DatCategoryView {
  key: string;
  label: string;
  note: string;
  default: boolean;
}
interface DatState {
  status: { games: number; entries: number; systems: number; importedAt: string | null };
  import: DatImportStatus;
  categories: DatCategoryView[];
}
interface CustomDatView {
  label: string;
  datName: string;
  slug: string | null;
  source: string;
  games: number;
}

export default function SettingsDatDb() {
  const [state, setState] = useState<DatState | null>(null);
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const catsInit = useRef(false);
  const router = useRouter();
  const t = useTranslations("settingsProviders.datDb");
  const running = state?.import.running ?? false;

  const toggle = (key: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch("/api/providers/datdb", { cache: "no-store" });
        const data: DatState = await res.json();
        if (stopped) return;
        setState(data);
        // Seed the checkboxes from the server's defaults, once.
        if (!catsInit.current && data.categories?.length) {
          catsInit.current = true;
          setSelected(new Set(data.categories.filter((c) => c.default).map((c) => c.key)));
        }
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
    if (selected.size === 0) {
      setMsg(t("pickAtLeastOne"));
      return;
    }
    playSound("activate");
    setMsg("");
    const res = await fetch("/api/providers/datdb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: [...selected] }),
    });
    const data = await res.json();
    if (!res.ok) setMsg(data.error ?? t("failedToStart"));
    else setState((cur) => (cur ? { ...cur, import: data.import } : cur));
  }

  // ---- custom (user-uploaded) DATs ----
  const [customDats, setCustomDats] = useState<CustomDatView[]>([]);
  const [custMsg, setCustMsg] = useState("");
  const [custBusy, setCustBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadCustom() {
    try {
      const res = await fetch("/api/providers/datdb/custom", { cache: "no-store" });
      const data = await res.json();
      setCustomDats(data.custom ?? []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/providers/datdb/custom", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) setCustomDats(data.custom ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    playSound("activate");
    setCustBusy(true);
    setCustMsg("");
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("dat", f);
    try {
      const res = await fetch("/api/providers/datdb/custom", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setCustMsg(data.error ?? t("uploadFailed"));
      } else {
        const n = data.imported?.length ?? 0;
        const games = (data.imported ?? []).reduce((s: number, i: { games: number }) => s + i.games, 0);
        setCustMsg(
          [
            n ? t("importedDats", { count: n, games: games.toLocaleString() }) : "",
            ...(data.errors ?? []),
          ]
            .filter(Boolean)
            .join(" · ")
        );
        await loadCustom();
        router.refresh();
      }
    } finally {
      setCustBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeCustom(label: string) {
    playSound("activate");
    await fetch(`/api/providers/datdb/custom?label=${encodeURIComponent(label)}`, { method: "DELETE" });
    await loadCustom();
    router.refresh();
  }

  const imported = (state?.status.games ?? 0) > 0;
  const imp = state?.import;
  const filePct = imp && imp.filesTotal > 0 ? Math.round((imp.filesDone / imp.filesTotal) * 100) : 0;

  return (
    <div>
      <GpSubHeader>{t("datDbHeader")}</GpSubHeader>
      <p className="mb-2 px-1 text-[13px] leading-relaxed text-dim">
        {t.rich("datIntro", { b: (c) => <span className="text-body">{c}</span> })}
      </p>

      {(state?.categories?.length ?? 0) > 0 && (
        <div className="mb-2 rounded-[3px] bg-[#23262e] p-3">
          <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.5px] text-dim">
            {t("datSetsToImport")}
          </div>
          {state!.categories.map((c) => (
            <GpCheck
              key={c.key}
              checked={selected.has(c.key)}
              onChange={() => toggle(c.key)}
              label={
                <span>
                  {c.label}
                  <span className="ml-2 text-[12px] text-dim">{c.note}</span>
                </span>
              }
            />
          ))}
          <p className="mt-1.5 px-1 text-[12px] text-dim">
            {t("categoriesNote")}
          </p>
        </div>
      )}

      <div className="settings-row">
        <div className="min-w-0">
          <div className="text-[16px] text-body">{t("offlineHashDb")}</div>
          <div className="mt-1 text-[12px] text-dim">
            {imported && !running
              ? t("importedStatus", {
                  games: state!.status.games.toLocaleString(),
                  entries: state!.status.entries.toLocaleString(),
                  systems: state!.status.systems.toLocaleString(),
                }) +
                (state!.status.importedAt
                  ? t("lastUpdated", { date: state!.status.importedAt.slice(0, 10) })
                  : "")
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
            {imp.phase === "listing"
              ? t("listingDats")
              : t("importingProgress", { done: imp.filesDone, total: imp.filesTotal }) +
                (imp.currentFile ? t("importingFile", { file: imp.currentFile.replace(/\.dat$/i, "") }) : "") +
                t("importingCounts", { games: imp.games.toLocaleString(), entries: imp.entries.toLocaleString() })}
          </div>
          <GpProgress value={imp.phase === "listing" ? 0 : filePct} />
        </div>
      )}

      {imp?.phase === "error" && <div className="px-1 text-[13px] text-danger">✗ {imp.error ?? t("importFailed")}</div>}
      {msg && <div className="px-1 text-[13px] text-danger">{msg}</div>}

      <div className="mt-6">
        <GpSubHeader>{t("customDatHeader")}</GpSubHeader>
        <p className="mb-2 px-1 text-[13px] leading-relaxed text-dim">
          {t.rich("customDatIntro", { b: (c) => <span className="text-body">{c}</span> })}
        </p>

        <div className="settings-row">
          <div className="min-w-0">
            <div className="text-[16px] text-body">{t("addDatFiles")}</div>
            <div className="mt-1 text-[12px] text-dim">{t("datFormatNote")}</div>
          </div>
          <GpButton onClick={() => fileRef.current?.click()} disabled={custBusy}>
            {custBusy ? t("importingLabel") : t("uploadDat")}
          </GpButton>
        </div>
        <input ref={fileRef} type="file" accept=".dat" multiple hidden onChange={onUpload} />

        {customDats.length > 0 && (
          <div className="mt-1 flex flex-col gap-1.5">
            {customDats.map((d) => (
              <div key={d.label} className="flex items-center gap-3 rounded-[3px] bg-black/25 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] text-body">{d.label}</div>
                  <div className="text-[12px] text-dim">
                    {t("customGamesCount", { count: d.games })} · {d.source}
                    {d.slug ? t("mappedTo", { slug: d.slug }) : t("unmappedSystem")}
                  </div>
                </div>
                <GpButton onClick={() => removeCustom(d.label)} className="shrink-0 !py-1 text-xs">
                  {t("remove")}
                </GpButton>
              </div>
            ))}
          </div>
        )}
        {custMsg && <div className="mt-1 px-1 text-[13px] text-dim">{custMsg}</div>}
      </div>
    </div>
  );
}
