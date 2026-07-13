"use client";

// 📁 button + modal that browses the SERVER's folders so paths can be picked
// instead of typed. Network shares can't be enumerated blind — type
// \\nas\share into the jump box and browse from there.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpModal, GpButton } from "@/components/bpm/primitives";

interface DirEntry {
  name: string;
  path: string;
}

export default function FolderPicker({
  initialPath = "",
  onPick,
  title,
  triggerLabel,
}: {
  initialPath?: string;
  onPick: (path: string) => void;
  title?: string;
  /** When set, the trigger renders as a text button (e.g. "Browse") instead of the 📁 icon */
  triggerLabel?: string;
}) {
  const t = useTranslations("fileModals");
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [isRoots, setIsRoots] = useState(false);
  const [serverPlatform, setServerPlatform] = useState("win32");
  const [jump, setJump] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function browse(target: string) {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch(`/api/fs/browse?path=${encodeURIComponent(target)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? t("folderPicker.cantOpen"));
        return;
      }
      setCurrent(data.path);
      setParent(data.parent);
      setDirs(data.dirs ?? []);
      setIsRoots(!!data.roots);
      setJump(data.path);
      if (data.platform) setServerPlatform(data.platform);
    } catch {
      setMsg(t("folderPicker.browseFailed"));
    } finally {
      setLoading(false);
    }
  }

  function openPicker() {
    playSound("modalOpen");
    setOpen(true);
    void browse(initialPath.trim());
  }

  function pick() {
    if (!current) return;
    playSound("confirm");
    onPick(current);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className={`btn-gray DialogButton Focusable shrink-0 cursor-pointer rounded-[2px] ${
          triggerLabel ? "px-4 py-2 text-[16px] leading-5" : "px-3 py-2 text-sm"
        }`}
        title={t("folderPicker.browseTitle")}
        aria-label={t("folderPicker.browseAria")}
      >
        {triggerLabel ?? "📁"}
      </button>

      {open && (
        <GpModal
          title={title ?? t("folderPicker.defaultTitle")}
          width={560}
          onClose={() => setOpen(false)}
          footer={
            <>
              <span className="mr-auto min-w-0 flex-1 truncate font-mono text-xs text-dim" title={current}>
                {current || t("folderPicker.pickDrive")}
              </span>
              <GpButton onClick={() => setOpen(false)}>{t("folderPicker.cancel")}</GpButton>
              <GpButton primary onClick={pick} disabled={!current}>
                {t("folderPicker.selectFolder")}
              </GpButton>
            </>
          }
        >
          <div className="flex gap-2">
            <input
              className="input-dark min-w-0 flex-1 px-3 py-2 font-mono text-xs"
              placeholder={t("folderPicker.jumpPlaceholder")}
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void browse(jump.trim());
              }}
            />
            <GpButton onClick={() => void browse(jump.trim())} className="shrink-0">
              {t("folderPicker.go")}
            </GpButton>
          </div>
          {msg && <p className="mt-2 text-xs text-danger">{msg}</p>}
          {serverPlatform !== "win32" && (
            <p className="mt-2 text-xs text-dim">
              {t("folderPicker.containerNote")}
            </p>
          )}

          <div className="mt-3 max-h-[50vh] min-h-48 overflow-y-auto rounded border border-black/40 px-1 py-1">
            {loading ? (
              <p className="px-3 py-4 text-sm text-dim">{t("common.loading")}</p>
            ) : (
              <>
                {parent !== null && !isRoots && (
                  <button
                    onClick={() => void browse(parent)}
                    className="Focusable flex w-full cursor-pointer items-center gap-3 rounded px-3 py-2 text-left text-sm text-body hover:bg-white/10"
                  >
                    <span className="w-5 text-center opacity-70">↰</span>..
                  </button>
                )}
                {dirs.map((d) => (
                  <button
                    key={d.path}
                    onClick={() => void browse(d.path)}
                    className="Focusable flex w-full cursor-pointer items-center gap-3 rounded px-3 py-2 text-left text-sm text-body hover:bg-white/10"
                  >
                    <span className="w-5 text-center opacity-70">📁</span>
                    <span className="min-w-0 truncate">{d.name}</span>
                  </button>
                ))}
                {dirs.length === 0 && !isRoots && (
                  <p className="px-3 py-4 text-sm text-dim">{t("folderPicker.noSubfolders")}</p>
                )}
              </>
            )}
          </div>
        </GpModal>
      )}
    </>
  );
}
