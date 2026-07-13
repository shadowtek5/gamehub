"use client";

// Per-system BIOS manager, opened from the system page's ⚙ menu: every BIOS
// file this console can use (region + required/optional) with present/verified
// status, matched-by-hash uploads and .zip auto-import. Scoped to one system.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpModal, GpButton } from "@/components/bpm/primitives";

type BiosRegion = "World" | "USA" | "Japan" | "Europe" | "Asia" | "Other";
interface FileStatus {
  file: string;
  region: BiosRegion;
  size: number;
  have: boolean;
  verified: boolean;
  rowId: number | null;
}
interface Extra { id: number; filename: string; size_bytes: number }
interface SystemStatus {
  slug: string;
  name: string;
  required: boolean;
  files: FileStatus[];
  extras: Extra[];
}

const REGION_COLOR: Record<BiosRegion, string> = {
  Japan: "#e0625f", USA: "#5b9bd5", Europe: "#8c7fe0", Asia: "#e0a35f", World: "#8b929a", Other: "#8b929a",
};
const REGION_LABEL: Record<BiosRegion, string> = {
  Japan: "JP", USA: "US", Europe: "EU", Asia: "AS", World: "World", Other: "—",
};

export default function FirmwareModal({
  slug,
  name,
  onClose,
}: {
  slug: string;
  name: string;
  onClose: () => void;
}) {
  const t = useTranslations("fileModals");
  const [sys, setSys] = useState<SystemStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const res = await fetch(`/api/firmware?platform=${slug}`, { cache: "no-store" });
      const data = await res.json();
      setSys((data.systems ?? [])[0] ?? null);
    } catch {}
    setLoaded(true);
  }
  useEffect(() => {
    // reload() only calls setState after an awaited fetch, so this is a
    // genuine data-load effect, not a synchronous cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMsg(t("firmware.uploading", { count: files.length }));
    try {
      const notes: string[] = [];
      let ok = 0;
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("platform", slug);
        form.append("file", file);
        const res = await fetch("/api/firmware", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          notes.push(`${file.name}: ${data.error ?? t("firmware.uploadItemFailed")}`);
          continue;
        }
        ok++;
        if (data.zip) {
          const kept = data.alreadyVerified?.length ?? 0;
          notes.push(
            t("firmware.zipImported", { imported: data.imported?.length ?? 0 }) +
              (kept ? t("firmware.zipKept", { kept }) : "") +
              t("firmware.zipSkipped", { skipped: data.skipped?.length ?? 0 })
          );
        }
        else if (data.outcome?.status === "verified") notes.push(`✓ ${data.outcome.filename} · ${data.outcome.region}`);
        else if (data.outcome?.status === "already-verified") notes.push(t("firmware.outcomeAlreadyVerified", { filename: data.outcome.filename }));
        else if (data.outcome?.status === "unverified") notes.push(t("firmware.outcomeUnverified", { filename: data.outcome.filename }));
        else if (data.outcome?.status === "rejected") notes.push(t("firmware.outcomeRejected", { filename: data.outcome.filename }));
      }
      playSound(ok > 0 ? "confirm" : "bumperEnd");
      setMsg(notes.join(" · "));
      void reload();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await fetch(`/api/firmware/${id}`, { method: "DELETE" });
    playSound("back");
    void reload();
  }

  return (
    <GpModal
      title={t("firmware.title", { name })}
      width={640}
      onClose={onClose}
      footer={
        <>
          {msg ? <span className="mr-auto text-xs text-accent">{msg}</span> : <span className="mr-auto" />}
          <GpButton onClick={onClose}>{t("common.close")}</GpButton>
          {sys && (
            <label className={`btn-blue DialogButton Focusable cursor-pointer rounded-[2px] px-4 py-2 text-[16px] leading-5 ${busy ? "opacity-50" : ""}`}>
              {t("firmware.uploadBios")}
              <input
                type="file"
                multiple
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </>
      }
    >
      <div className="mb-3 flex items-center gap-2">
        {sys && (
          <span
            className="rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={
              sys.required
                ? { backgroundColor: "#e0625f22", color: "#e0625f" }
                : { backgroundColor: "#8b929a22", color: "#8b929a" }
            }
          >
            {sys.required ? t("firmware.biosRequired") : t("firmware.biosOptional")}
          </span>
        )}
        <p className="text-sm text-dim">
          {t("firmware.description")}
        </p>
      </div>

      <div className="flex flex-col gap-1">
            {!loaded && <p className="text-sm text-dim">{t("common.loading")}</p>}
            {loaded && !sys && (
              <p className="text-sm text-dim">{t("firmware.noBios", { name })}</p>
            )}
            {sys?.files.map((f) => (
              <div key={f.file} className={`flex items-center gap-3 rounded bg-black/25 px-3 py-2 ${f.have ? "" : "opacity-60"}`}>
                <span
                  className="shrink-0 rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ backgroundColor: `${REGION_COLOR[f.region]}22`, color: REGION_COLOR[f.region] }}
                >
                  {REGION_LABEL[f.region]}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-body">{f.file}</span>
                {f.have ? (
                  f.verified ? (
                    <span className="shrink-0 rounded bg-[#4c9e28]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8ce05f]">
                      {t("firmware.verified")}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded bg-[#8a6510]/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#e8c268]" title={t("firmware.unverifiedTitle")}>
                      {t("firmware.unverified")}
                    </span>
                  )
                ) : (
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-dim">{t("firmware.missing")}</span>
                )}
                <span className="shrink-0 text-xs text-dim">{f.size ? `${(f.size / 1024).toFixed(0)} KB` : ""}</span>
                {f.have && f.rowId != null && (
                  <>
                    <a href={`/api/firmware/${f.rowId}`} className="shrink-0 text-xs text-dim hover:text-bright" title={t("firmware.download")}>⇩</a>
                    <button onClick={() => remove(f.rowId!)} className="shrink-0 cursor-pointer text-xs text-dim hover:text-bright" title={t("firmware.remove")}>✕</button>
                  </>
                )}
              </div>
            ))}
            {sys?.extras.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded border border-dashed border-white/10 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-dim">{e.filename}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-dim">{t("firmware.extra")}</span>
                <span className="shrink-0 text-xs text-dim">{(e.size_bytes / 1024).toFixed(0)} KB</span>
                <a href={`/api/firmware/${e.id}`} className="shrink-0 text-xs text-dim hover:text-bright" title={t("firmware.download")}>⇩</a>
                <button onClick={() => remove(e.id)} className="shrink-0 cursor-pointer text-xs text-dim hover:text-bright" title={t("firmware.remove")}>✕</button>
              </div>
            ))}
      </div>
    </GpModal>
  );
}
