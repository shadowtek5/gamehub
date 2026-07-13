"use client";

// Settings → Firmware. The BIOS/firmware the emulator needs to boot certain
// systems. Shows, per BIOS-capable system, every BIOS file the console can
// use (region + required/optional) and whether it's present & verified. Upload
// a single file (matched by content hash, even if mis-named) or drop a .zip to
// auto-file every BIOS it contains.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpRow, GpSubHeader, GpDropdown, GpButton, GpCheck } from "./primitives";

type BiosRegion = "World" | "USA" | "Japan" | "Europe" | "Asia" | "Other";
interface FileStatus {
  file: string;
  region: BiosRegion;
  size: number;
  required?: boolean;
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
  Japan: "#e0625f",
  USA: "#5b9bd5",
  Europe: "#8c7fe0",
  Asia: "#e0a35f",
  World: "#8b929a",
  Other: "#8b929a",
};
const REGION_LABEL: Record<BiosRegion, string> = {
  Japan: "JP", USA: "US", Europe: "EU", Asia: "AS", World: "World", Other: "—",
};

function RegionPill({ region }: { region: BiosRegion }) {
  return (
    <span
      className="rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ backgroundColor: `${REGION_COLOR[region]}22`, color: REGION_COLOR[region] }}
    >
      {REGION_LABEL[region]}
    </span>
  );
}

export default function SettingsInGame() {
  const t = useTranslations("settingsProviders.firmware");
  const [systems, setSystems] = useState<SystemStatus[] | null>(null);
  const [filePlatform, setFilePlatform] = useState(""); // system for individual uploads
  const [zipScope, setZipScope] = useState(""); // "" = all systems, else limit zip to one
  const [showOptional, setShowOptional] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const toggleExpand = (slug: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });
  // A <button> inside a <label> doesn't trigger the label's file input, so the
  // hidden inputs are opened via refs from each button's onClick instead.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  async function reload() {
    try {
      const res = await fetch("/api/firmware", { cache: "no-store" });
      const data = await res.json();
      setSystems(data.systems ?? []);
    } catch {}
  }
  useEffect(() => {
    void reload();
  }, []);

  async function upload(files: FileList | null, targetSlug: string) {
    if (!files?.length) return;
    setBusy(true);
    setMsg(t("uploadingFiles", { count: files.length }));
    try {
      const notes: string[] = [];
      let ok = 0;
      for (const file of Array.from(files)) {
        const form = new FormData();
        if (targetSlug) form.append("platform", targetSlug);
        form.append("file", file);
        const res = await fetch("/api/firmware", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          notes.push(`${file.name}: ${data.error ?? t("failed")}`);
          continue;
        }
        ok++;
        if (data.zip) {
          const kept = data.alreadyVerified?.length ?? 0;
          notes.push(
            `${file.name}: ` +
              t("zipImported", { count: data.imported?.length ?? 0 }) +
              (kept ? t("zipKept", { count: kept }) : "") +
              t("zipSkipped", { count: data.skipped?.length ?? 0 })
          );
        } else if (data.outcome) {
          const o = data.outcome;
          notes.push(
            o.status === "verified"
              ? `✓ ${o.filename} · ${o.region} · ${o.slug}`
              : o.status === "already-verified"
                ? `✓ ${o.filename}: ${t("alreadyVerifiedKept")}`
                : o.status === "unverified"
                  ? `${o.filename}: ${t("acceptedUnverified")}`
                  : `✗ ${o.filename}: ${t("notExpectedBios")}`
          );
        }
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

  const biosOptions = useMemo(
    () => (systems ?? []).map((s) => ({ value: s.slug, label: `${s.name}${s.required ? "" : t("optionalSuffix")}` })),
    [systems]
  );

  // Hide optional systems with nothing uploaded unless "show optional" is on;
  // then filter by the search box (system name).
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (systems ?? []).filter((s) => {
      const keep = showOptional || s.required || s.files.some((f) => f.have) || s.extras.length > 0;
      if (!keep) return false;
      return !q || s.name.toLowerCase().includes(q) || s.slug.includes(q);
    });
  }, [systems, showOptional, query]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <GpSubHeader>{t("addBios")}</GpSubHeader>

        {/* Option 1 — individual files for a chosen system */}
        <GpRow
          label={t("uploadIndividualLabel")}
          description={t("uploadIndividualDesc")}
        >
          <div className="flex items-center gap-3">
            <GpDropdown
              value={filePlatform}
              width={260}
              onChange={setFilePlatform}
              options={[{ value: "", label: t("chooseSystem") }, ...biosOptions]}
            />
            <GpButton
              primary
              disabled={!filePlatform || busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {t("chooseFiles")}
            </GpButton>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void upload(e.target.files, filePlatform);
                e.target.value = "";
              }}
            />
          </div>
        </GpRow>

        {/* Option 2 — a whole zip, auto-matched */}
        <GpRow
          label={t("importZipLabel")}
          description={t("importZipDesc")}
        >
          <div className="flex items-center gap-3">
            <GpDropdown
              value={zipScope}
              width={260}
              onChange={setZipScope}
              options={[{ value: "", label: t("allSystems") }, ...biosOptions]}
            />
            <GpButton disabled={busy} onClick={() => zipInputRef.current?.click()}>
              {t("chooseZip")}
            </GpButton>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                void upload(e.target.files, zipScope);
                e.target.value = "";
              }}
            />
          </div>
        </GpRow>

        {msg && <div className="px-1 text-[13px] text-accent">{msg}</div>}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3 px-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchSystems")}
            className="input-dark min-w-0 flex-1 rounded-[3px] px-3 py-2 text-[14px]"
          />
          <GpCheck checked={showOptional} onChange={setShowOptional} label={t("showOptional")} />
          <span className="whitespace-nowrap text-[13px] text-dim">
            {t("systemsCount", { count: visible.length })}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          {visible.map((s) => {
            const have = s.files.filter((f) => f.have).length;
            const total = s.files.length;
            const open = expanded.has(s.slug);
            const dot = have === 0 ? "#67707b" : have >= total ? "#8ce05f" : "#e8c268";
            return (
              <div key={s.slug} className="overflow-hidden rounded-[3px] bg-white/[0.03]">
                <button
                  onClick={() => toggleExpand(s.slug)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.06]"
                >
                  <span className={`text-dim transition-transform ${open ? "rotate-90" : ""}`}>›</span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
                  <span className="font-medium text-bright">{s.name}</span>
                  <span
                    className="rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={
                      s.required
                        ? { backgroundColor: "#e0625f22", color: "#e0625f" }
                        : { backgroundColor: "#8b929a22", color: "#8b929a" }
                    }
                  >
                    {s.required ? t("requiredLabel") : t("optionalLabel")}
                  </span>
                  <span className="ml-auto text-[13px] text-dim">
                    {t("filesCount", { have, total, count: total })}
                    {s.extras.length ? t("extraSuffix", { count: s.extras.length }) : ""}
                  </span>
                </button>

                {open && (
                  <div className="border-t border-white/[0.06] px-2 py-1">
                    {s.files.map((f) => (
                      <div
                        key={f.file}
                        className={`flex items-center gap-3 rounded-[3px] px-2 py-2 ${f.have ? "" : "opacity-60"}`}
                      >
                        <RegionPill region={f.region} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-[14px] text-body">{f.file}</div>
                          <div className="mt-0.5 text-[12px]">
                            {f.have ? (
                              f.verified ? (
                                <span className="text-[#8ce05f]">{t("verifiedStatus")}</span>
                              ) : (
                                <span className="text-[#e8c268]">{t("presentHashDiffers")}</span>
                              )
                            ) : (
                              <span className="text-dim">{t("missing")}</span>
                            )}
                            {f.size ? <span className="text-dim"> · {(f.size / 1024).toFixed(0)} KB</span> : null}
                          </div>
                        </div>
                        {f.have && f.rowId != null && (
                          <div className="flex shrink-0 items-center gap-2">
                            <a href={`/api/firmware/${f.rowId}`}>
                              <GpButton>{t("download")}</GpButton>
                            </a>
                            <GpButton onClick={() => remove(f.rowId!)}>{t("remove")}</GpButton>
                          </div>
                        )}
                      </div>
                    ))}
                    {s.extras.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 rounded-[3px] px-2 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-[14px] text-body">{e.filename}</div>
                          <div className="mt-0.5 text-[12px] text-dim">
                            {t("extraNotBios")} · {(e.size_bytes / 1024).toFixed(0)} KB
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <a href={`/api/firmware/${e.id}`}>
                            <GpButton>{t("download")}</GpButton>
                          </a>
                          <GpButton onClick={() => remove(e.id)}>{t("remove")}</GpButton>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {systems && visible.length === 0 && (
            <div className="settings-row">
              <div className="text-[15px] text-dim">
                {query ? t("noSystemsMatch") : t("noBiosYet")}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
