"use client";

// System firmware & keys for one console (PS Vita / PS3 PUPs, Switch keys and
// firmware, 3DS and Wii U keys): what's uploaded, upload a file or a whole folder
// (Switch firmware .nca files), download and remove. Used by Settings › Firmware
// and the per-system Firmware modal (desktop/TV and mobile).

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { uploadFirmwareFile, type FirmwareUploadResult } from "@/lib/firmwareUpload";
import { GpButton } from "@/components/bpm/primitives";

export interface PackageStatus {
  id: string;
  label: string;
  required: boolean;
  folder: string | null;
  files: { id: number; filename: string; size_bytes: number }[];
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** One line describing an upload's result. */
export function describeUpload(
  t: ReturnType<typeof useTranslations>,
  name: string,
  r: FirmwareUploadResult
): string {
  if (!r.ok) return t("rejected", { name, error: r.error ?? "" });
  if (r.zip) return t("zipFiled", { name, count: r.imported?.length ?? 0 });
  const o = r.outcome;
  if (!o) return name;
  if (o.status === "already") return t("already", { name });
  if (o.status === "package") return t("uploadedPackage", { name, slug: o.slug });
  return t(o.verified ? "uploadedBios" : "uploadedBiosUnverified", { name, file: o.filename, slug: o.slug });
}

export default function FirmwarePackagesPanel({
  slug,
  packages,
  canEdit,
  onChanged,
}: {
  slug: string;
  packages: PackageStatus[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("firmwarePackages");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  if (!packages.length) return null;

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    const notes: string[] = [];
    let ok = 0;
    const files = Array.from(list).filter((f) => !f.name.startsWith("."));
    for (const [i, file] of files.entries()) {
      const r = await uploadFirmwareFile(file, slug, (pct) =>
        setMsg(t("uploading", { name: file.name, pct, n: i + 1, total: files.length }))
      );
      if (r.ok) ok++;
      // A folder of hundreds of .nca files: only report problems, plus one summary line.
      if (!r.ok || files.length <= 5) notes.push(describeUpload(t, file.name, r));
    }
    if (files.length > 5) notes.unshift(t("folderDone", { ok, total: files.length }));
    playSound(ok > 0 ? "confirm" : "bumperEnd");
    setMsg(notes.slice(0, 8).join(" · "));
    setBusy(false);
    onChanged();
  }

  async function removeAll(p: PackageStatus) {
    for (const f of p.files) await fetch(`/api/firmware/${f.id}`, { method: "DELETE" });
    playSound("back");
    onChanged();
  }

  return (
    <div className="mt-1 rounded-[3px] border-t border-white/[0.06] px-2 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-dim">{t("title")}</div>
      <p className="mt-1 text-[12px] text-dim">{t("intro")}</p>
      <div className="mt-2 flex flex-col gap-1">
        {packages.map((p) => {
          const size = p.files.reduce((n, f) => n + f.size_bytes, 0);
          const single = p.files.length === 1 ? p.files[0] : null;
          return (
            <div key={p.id} className={`flex items-center gap-3 rounded-[3px] bg-black/20 px-2 py-2 ${p.files.length ? "" : "opacity-70"}`}>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: p.files.length ? "#8ce05f" : p.required ? "#e0625f" : "#67707b" }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] text-body">
                  {t.has(`label.${slug}.${p.id}`) ? t(`label.${slug}.${p.id}`) : p.label}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-dim">
                  {p.files.length === 0
                    ? `${p.required ? t("required") : t("optional")} · ${t("missing")}`
                    : single
                      ? `${single.filename} · ${formatSize(size)}`
                      : t("files", { count: p.files.length, size: formatSize(size) })}
                </div>
              </div>
              {single && (
                <a href={`/api/firmware/${single.id}`} className="shrink-0">
                  <GpButton>{t("download")}</GpButton>
                </a>
              )}
              {canEdit && p.files.length > 0 && <GpButton onClick={() => void removeAll(p)}>{t("remove")}</GpButton>}
            </div>
          );
        })}
      </div>
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <GpButton disabled={busy} onClick={() => fileRef.current?.click()}>
            {t("uploadFile")}
          </GpButton>
          {packages.some((p) => p.folder) && (
            <GpButton disabled={busy} onClick={() => folderRef.current?.click()}>
              {t("uploadFolder")}
            </GpButton>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={folderRef}
            type="file"
            multiple
            className="hidden"
            // Not in React's input typings, but every current browser supports picking a folder this way.
            {...({ webkitdirectory: "" } as Record<string, string>)}
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {msg && <div className="mt-2 text-[12px] text-accent">{msg}</div>}
    </div>
  );
}
