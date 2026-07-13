"use client";

// Upload ROM files into this system's mapped folder from the browser —
// only ADDS files (never overwrites), then scans them into the library.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpModal, GpButton } from "@/components/bpm/primitives";

export default function RomUploadModal({
  slug,
  name,
  onClose,
}: {
  slug: string;
  name: string;
  onClose: () => void;
}) {
  const t = useTranslations("fileModals");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const router = useRouter();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErrors([]);
    setMsg(t("romUpload.uploading", { count: files.length }));
    try {
      const form = new FormData();
      form.append("platform", slug);
      for (const f of Array.from(files)) form.append("files", f);
      const res = await fetch("/api/roms/upload", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok && data.ok) {
        playSound("toast");
        setMsg(t("romUpload.added", { count: data.saved.length }));
        setErrors(data.errors ?? []);
        router.refresh();
        window.dispatchEvent(new Event("gh-library-refetch"));
      } else {
        playSound("bumperEnd");
        setMsg(`✗ ${data.error ?? t("romUpload.uploadFailed")}`);
        setErrors(data.errors ?? []);
      }
    } catch (e) {
      setMsg(`✗ ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <GpModal
      title={t("romUpload.title", { name })}
      width={520}
      onClose={onClose}
      footer={<GpButton onClick={onClose}>{t("common.close")}</GpButton>}
    >
      <p className="text-sm text-dim">
        {t("romUpload.description")}
      </p>

      <div className="mt-5">
        <label
          className={`btn-blue DialogButton Focusable inline-block px-5 py-2.5 text-sm ${busy ? "opacity-50" : "cursor-pointer"}`}
        >
          {busy ? t("romUpload.uploadingShort") : t("romUpload.choose")}
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
      </div>

      {msg && <p className="mt-4 text-sm text-body">{msg}</p>}
      {errors.map((e) => (
        <p key={e} className="mt-1 text-xs text-[#e8c268]">
          ⚠ {e}
        </p>
      ))}
    </GpModal>
  );
}
