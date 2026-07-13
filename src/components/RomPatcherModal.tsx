"use client";

// In-browser ROM patcher: applies an IPS/UPS/BPS patch to this game's file
// and downloads the result. The server (and your original ROM) are never
// modified.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { applyPatch } from "@/lib/patch";
import { playSound } from "@/lib/sounds";
import { GpModal, GpButton } from "@/components/bpm/primitives";

export default function RomPatcherModal({
  romId,
  title,
  filename,
  onClose,
}: {
  romId: number;
  title: string;
  filename: string;
  onClose: () => void;
}) {
  const t = useTranslations("gameToolsMisc");
  const [patchFile, setPatchFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  async function patch() {
    if (!patchFile) return;
    setBusy(true);
    setMsg(t("romPatcher.downloadingRom"));
    setWarnings([]);
    try {
      const res = await fetch(`/api/roms/${romId}/file`);
      if (!res.ok) throw new Error(t("romPatcher.loadError", { status: res.status }));
      const rom = new Uint8Array(await res.arrayBuffer());
      setMsg(t("romPatcher.applyingPatch"));
      const patchData = new Uint8Array(await patchFile.arrayBuffer());
      const result = applyPatch(rom, patchData, patchFile.name);
      setWarnings(result.warnings);

      // Name: original base + patch base + original extension
      const dot = filename.lastIndexOf(".");
      const base = dot > 0 ? filename.slice(0, dot) : filename;
      const ext = dot > 0 ? filename.slice(dot) : "";
      const patchBase = patchFile.name.replace(/\.[a-z0-9]+$/i, "");
      const outName = `${base} (${patchBase})${ext}`;

      const blob = new Blob([result.data as unknown as BlobPart], {
        type: "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      playSound("toast");
      setMsg(t("romPatcher.patched", { name: outName }));
    } catch (e) {
      playSound("bumperEnd");
      setMsg(`✗ ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <GpModal
      title={t("romPatcher.modalTitle", { title })}
      width={520}
      onClose={onClose}
      footer={
        <>
          <GpButton onClick={onClose}>{t("shared.close")}</GpButton>
          <GpButton primary onClick={patch} disabled={!patchFile || busy}>
            {busy ? t("romPatcher.working") : t("romPatcher.applyDownload")}
          </GpButton>
        </>
      }
    >
      <p className="text-sm text-dim">
        {t("romPatcher.intro")}
      </p>

      <div className="mt-5">
        <label className="btn-gray DialogButton Focusable inline-block cursor-pointer px-4 py-2 text-sm">
          {patchFile ? patchFile.name : t("romPatcher.choosePatch")}
          <input
            type="file"
            accept=".ips,.ups,.bps"
            className="hidden"
            onChange={(e) => {
              setPatchFile(e.target.files?.[0] ?? null);
              setMsg("");
              setWarnings([]);
            }}
          />
        </label>
      </div>

      {msg && <p className="mt-4 text-sm text-body">{msg}</p>}
      {warnings.map((w) => (
        <p key={w} className="mt-2 text-xs text-[#e8c268]">
          ⚠ {w}
        </p>
      ))}
    </GpModal>
  );
}
