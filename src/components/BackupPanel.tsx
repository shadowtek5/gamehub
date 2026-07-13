"use client";

// Backup & restore (Settings → System). Backups are streaming .tar archives
// of GameHub's data folder — ROM files are never included. Built on the BPM
// primitives so it rows/toggles/dialogs like every other settings surface.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { playSound } from "@/lib/sounds";
import {
  GpRow,
  GpSubHeader,
  GpToggle,
  GpButton,
  GpModal,
  GpProgress,
} from "@/components/bpm/primitives";

const PARTS = [
  { key: "saves", def: true },
  { key: "firmware", def: true },
  { key: "media", def: false },
  { key: "launchbox", def: false },
] as const;

type PartKey = (typeof PARTS)[number]["key"];

export default function BackupPanel() {
  const [parts, setParts] = useState<Record<PartKey, boolean>>(
    Object.fromEntries(PARTS.map((p) => [p.key, p.def])) as Record<PartKey, boolean>
  );
  const [file, setFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const t = useTranslations("maintenance.backupPanel");

  // Credential-key status: is it an env var or a local file, and does the file
  // exist? Drives the security warning + "save the key" action below.
  const [keyInfo, setKeyInfo] = useState<{ source: "env" | "file"; filePresent: boolean } | null>(
    null
  );
  useEffect(() => {
    fetch("/api/backup/secret-key")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setKeyInfo(d))
      .catch(() => {});
  }, []);

  function downloadBackup() {
    const q = PARTS.filter((p) => parts[p.key])
      .map((p) => `${p.key}=1`)
      .join("&");
    window.location.href = `/api/backup${q ? `?${q}` : ""}`;
  }

  function downloadKey() {
    playSound("activate");
    window.location.href = "/api/backup/secret-key?download=1";
  }

  function restore() {
    if (!file) return;
    setConfirming(false);
    playSound("activate");
    setRestoring(true);
    setMsg("");
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/backup/restore");
    xhr.setRequestHeader("Content-Type", "application/x-tar");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setRestoring(false);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          playSound("confirm");
          setDone(true);
          setMsg(
            "✓ " +
              t("restoredSuccess", {
                items: data.restored.join(", "),
                files: data.files,
                date: String(data.backupCreatedAt).slice(0, 16).replace("T", " "),
              })
          );
          setTimeout(() => {
            router.push("/login");
            router.refresh();
          }, 2500);
        } else {
          setMsg(`✗ ${data.error ?? t("restoreFailed")}`);
        }
      } catch {
        setMsg("✗ " + t("restoreFailed"));
      }
    };
    xhr.onerror = () => {
      setRestoring(false);
      setMsg("✗ " + t("uploadFailed"));
    };
    xhr.send(file);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <GpSubHeader>{t("backup")}</GpSubHeader>
        {PARTS.map((p) => (
          <GpRow key={p.key} label={t(`parts.${p.key}.label`)} description={t(`parts.${p.key}.hint`)}>
            <GpToggle
              on={parts[p.key]}
              onChange={(v) => setParts({ ...parts, [p.key]: v })}
              label={t(`parts.${p.key}.label`)}
            />
          </GpRow>
        ))}
        <GpRow
          label={t("createBackup")}
          description={t("createBackupDesc")}
        >
          <GpButton primary onClick={downloadBackup}>
            {t("downloadBackup")}
          </GpButton>
        </GpRow>
      </div>

      <div>
        <GpSubHeader>{t("credentialKey")}</GpSubHeader>
        <div className="rounded-[3px] border-l-2 border-[#e0a33a] bg-[#e0a33a]/10 px-4 py-3 text-[13px] leading-relaxed text-body">
          <p>
            <span className="font-semibold text-[#f0c069]">{t("keepKeySafe")}</span>{" "}
            {t.rich("warningBody", { b: (c) => <b>{c}</b> })}
          </p>
          {keyInfo?.source === "env" ? (
            <p className="mt-2 text-dim">
              {t.rich("envKeyDesc", {
                secretKeyEnv: "GAMEHUB_SECRET_KEY",
                code: (c) => <code className="text-body">{c}</code>,
              })}
            </p>
          ) : (
            <>
              <p className="mt-2 text-dim">
                {t.rich("fileKeyDesc", {
                  keyPath: "data/.secret.key",
                  secretKeyEnv: "GAMEHUB_SECRET_KEY",
                  b: (c) => <b>{c}</b>,
                  code: (c) => <code className="text-body">{c}</code>,
                })}
              </p>
              <div className="mt-3">
                <GpButton onClick={downloadKey} disabled={keyInfo !== null && !keyInfo.filePresent}>
                  {t("saveKey")}
                </GpButton>
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <GpSubHeader>{t("restore")}</GpSubHeader>
        <GpRow
          label={t("restoreFromBackup")}
          description={
            file
              ? t("selectedFile", { name: file.name, size: (file.size / 1024 ** 2).toFixed(1) })
              : t("restoreDesc")
          }
        >
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".tar,application/x-tar"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <GpButton onClick={() => fileInput.current?.click()} disabled={restoring}>
              {t("chooseFile")}
            </GpButton>
            <GpButton
              onClick={() => setConfirming(true)}
              disabled={!file || restoring || done}
            >
              {restoring ? (progress < 100 ? t("uploading", { progress }) : t("restoring")) : t("restore")}
            </GpButton>
          </div>
        </GpRow>
        {restoring && (
          <GpProgress value={progress} />
        )}
        {msg && (
          <p className={`mt-3 text-sm ${msg.startsWith("✓") ? "text-accent" : "text-danger"}`}>{msg}</p>
        )}
      </div>

      {confirming && (
        <GpModal
          title={t("restoreConfirmTitle")}
          onClose={() => setConfirming(false)}
          width={560}
          footer={
            <>
              <GpButton onClick={() => setConfirming(false)}>{t("cancel")}</GpButton>
              <GpButton primary onClick={restore}>
                {t("restore")}
              </GpButton>
            </>
          }
        >
          <p className="text-[15px] leading-relaxed text-body">
            {t.rich("restoreConfirmBody", { b: (c) => <b>{c}</b> })}
          </p>
          <p className="mt-3 text-[13px] text-dim">
            {t("restoreConfirmNote", { backupName: "gamehub.db.pre-restore" })}
          </p>
        </GpModal>
      )}
    </div>
  );
}
