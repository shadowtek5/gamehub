"use client";

// Saves & states, RomM-style: the battery save (one live .srm slot synced
// from play sessions) plus save-state cards with screenshots, labels,
// resume/download/upload/delete.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatBytes } from "@/lib/format";
import { playSound } from "@/lib/sounds";
import { GpConfirm } from "@/components/bpm/primitives";

export interface SaveStateInfo {
  id: number;
  size_bytes: number;
  has_screenshot: number;
  created_at: string;
  label: string | null;
}

export interface BatterySaveInfo {
  size_bytes: number;
  updated_at: string;
}

// clean line icons (currentColor) in place of emoji/arrow glyphs
const IC = "h-[18px] w-[18px]";
const Stroke = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: IC };
const IconDownload = () => (<svg {...Stroke}><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 20h14" /></svg>);
const IconUpload = () => (<svg {...Stroke}><path d="M12 21V10m0 0 4 4m-4-4-4 4M5 4h14" /></svg>);
const IconTrash = () => (<svg {...Stroke}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m1 0v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7" /></svg>);
const IconSave = () => (<svg {...Stroke}><path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" /></svg>);

// Steam icon-button (matches the play bar's controller/gear buttons)
const ICON_BTN =
  "Focusable flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[3px] bg-[#acb2c9]/[0.14] text-body outline-none transition-colors hover:bg-[#acb2c9]/25 hover:text-bright focus:ring-2 focus:ring-inset focus:ring-white/70";

export default function SaveStatesPanel({
  romId,
  playable,
  initialStates,
  batterySave,
  gameImage,
}: {
  romId: number;
  playable: boolean;
  initialStates: SaveStateInfo[];
  batterySave?: BatterySaveInfo | null;
  /** the game's art (boxart/screenshot) shown beside the battery save */
  gameImage?: string | null;
}) {
  const [states, setStates] = useState(initialStates);
  const [battery, setBattery] = useState(batterySave ?? null);
  const [editing, setEditing] = useState<number | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [msg, setMsg] = useState("");
  const [confirming, setConfirming] = useState<{ kind: "state"; id: number } | { kind: "battery" } | null>(null);
  const router = useRouter();
  const t = useTranslations("gameMedia.saveStates");

  async function removeState(id: number) {
    const res = await fetch(`/api/states/${id}`, { method: "DELETE" });
    if (res.ok) {
      playSound("confirm");
      setStates((cur) => cur.filter((s) => s.id !== id));
    }
  }

  async function saveLabel(id: number) {
    await fetch(`/api/states/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: labelDraft }),
    });
    playSound("confirm");
    setStates((cur) =>
      cur.map((s) => (s.id === id ? { ...s, label: labelDraft.trim() || null } : s))
    );
    setEditing(null);
  }

  async function uploadState(file: File | null) {
    if (!file) return;
    setMsg(t("uploadingState"));
    const form = new FormData();
    form.append("state", file);
    form.append("label", file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 64));
    const res = await fetch(`/api/roms/${romId}/states`, { method: "POST", body: form });
    if (res.ok) {
      playSound("confirm");
      setMsg(t("stateUploaded"));
      router.refresh();
      const list = await fetch(`/api/roms/${romId}/states`).then((r) => r.json());
      setStates(list.states ?? []);
    } else {
      setMsg(t("uploadFailed"));
    }
  }

  async function uploadBattery(file: File | null) {
    if (!file) return;
    setMsg(t("uploadingSave"));
    const form = new FormData();
    form.append("save", file);
    const res = await fetch(`/api/roms/${romId}/save`, { method: "POST", body: form });
    if (res.ok) {
      playSound("confirm");
      setMsg(t("batteryUploaded"));
      setBattery({ size_bytes: file.size, updated_at: new Date().toISOString() });
    } else {
      setMsg(t("uploadFailed"));
    }
  }

  async function removeBattery() {
    const res = await fetch(`/api/roms/${romId}/save`, { method: "DELETE" });
    if (res.ok) {
      playSound("back");
      setBattery(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Battery save (.srm) — a lifted Field-style row */}
      <div className="gamepaddialog_Field_gh flex items-center gap-4 rounded-[3px] bg-white/[0.04] px-4 py-3">
        {gameImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gameImage}
            alt=""
            className="h-10 w-10 shrink-0 rounded-[3px] object-cover ring-1 ring-white/10"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[3px] bg-white/[0.06] text-body">
            <IconSave />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="gamepaddialog_FieldLabel_gh text-[15px] font-medium text-bright">{t("batterySave")}</div>
          <div className="gamepaddialog_FieldDescription_gh text-[12px] text-dim">
            {battery
              ? t("batteryMeta", { size: formatBytes(battery.size_bytes), date: battery.updated_at.slice(0, 16).replace("T", " ") })
              : playable
                ? t("batteryNoneYet")
                : t("batteryNone")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {battery && (
            <a href={`/api/roms/${romId}/save`} download className={ICON_BTN} title={t("downloadSrm")}>
              <IconDownload />
            </a>
          )}
          <label className={ICON_BTN} title={t("uploadSrm")}>
            <IconUpload />
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                void uploadBattery(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
          {battery && (
            <button onClick={() => setConfirming({ kind: "battery" })} className={ICON_BTN} title={t("delete")}>
              <IconTrash />
            </button>
          )}
        </div>
      </div>

      {/* Save states header + upload */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.5px] text-[#b8bcbf]">
          {t("saveStatesHeading")} {states.length > 0 && `(${states.length})`}
        </h3>
        <div className="flex items-center gap-3">
          {msg && <span className="text-[12px] text-accent">{msg}</span>}
          <label className="gamepaddialog_Button_gh DialogButton Focusable flex cursor-pointer items-center gap-2 rounded-[2px] bg-[#acb2c9]/[0.14] px-3 py-1.5 text-[13px] font-medium text-body outline-none transition-colors hover:bg-[#acb2c9]/25 hover:text-bright focus:ring-2 focus:ring-inset focus:ring-white/70">
            <IconUpload />
            {t("uploadState")}
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                void uploadState(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {states.length === 0 ? (
        <p className="rounded-[3px] bg-white/[0.04] px-4 py-6 text-center text-[13px] text-dim">
          {t("noSaveStates")}{" "}
          {playable && t("noSaveStatesHint")}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(224px,1fr))] gap-3">
          {states.map((s) => (
            <div
              key={s.id}
              className="deck-card group overflow-hidden rounded-[3px] bg-[#23262e] ring-1 ring-white/[0.06]"
            >
              <div className="relative">
                {s.has_screenshot ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/states/${s.id}?type=screenshot`}
                    alt={t("saveStateAlt")}
                    className="aspect-video w-full bg-black object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-black/40 text-dim">
                    <IconSave />
                  </div>
                )}
                {playable && (
                  <a
                    href={`/play/${romId}?state=${s.id}`}
                    className="Focusable absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 outline-none transition-opacity hover:opacity-100 focus:opacity-100 focus:ring-2 focus:ring-inset focus:ring-white/80"
                    title={t("resumeTitle")}
                  >
                    <span className="flex items-center gap-2 rounded-[2px] bg-[#59bf40] px-4 py-2 text-[14px] font-semibold text-[#0e141b]">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5"><path d="M6 4l14 8-14 8z" /></svg>
                      {t("resume")}
                    </span>
                  </a>
                )}
              </div>
              <div className="flex items-start gap-2 p-3">
                <div className="min-w-0 flex-1">
                  {editing === s.id ? (
                    <input
                      className="input-dark mb-0.5 w-full px-2 py-1 text-[13px]"
                      value={labelDraft}
                      autoFocus
                      maxLength={64}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveLabel(s.id);
                        if (e.key === "Escape") setEditing(null);
                      }}
                      onBlur={() => void saveLabel(s.id)}
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setEditing(s.id);
                        setLabelDraft(s.label ?? "");
                      }}
                      className="Focusable block w-full cursor-text truncate rounded text-left text-[14px] font-medium text-bright outline-none hover:text-white focus:ring-2 focus:ring-white/40"
                      title={t("clickToRename")}
                    >
                      {s.label || s.created_at.slice(0, 16).replace("T", " ")}
                    </button>
                  )}
                  <div className="text-[11px] text-dim">
                    {s.created_at.slice(0, 16).replace("T", " ")} · {formatBytes(s.size_bytes)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <a
                    href={`/api/states/${s.id}`}
                    download={`${s.label || `state-${s.id}`}.state`}
                    className="Focusable flex h-8 w-8 items-center justify-center rounded-[3px] bg-white/[0.06] text-body outline-none transition-colors hover:bg-white/15 hover:text-bright focus:ring-2 focus:ring-inset focus:ring-white/70"
                    title={t("downloadStateFile")}
                  >
                    <IconDownload />
                  </a>
                  <button
                    onClick={() => setConfirming({ kind: "state", id: s.id })}
                    className="Focusable flex h-8 w-8 items-center justify-center rounded-[3px] bg-white/[0.06] text-body outline-none transition-colors hover:bg-white/15 hover:text-bright focus:ring-2 focus:ring-inset focus:ring-white/70"
                    title={t("delete")}
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirming && (
        <GpConfirm
          title={confirming.kind === "state" ? t("deleteStateConfirm") : t("deleteBatteryConfirm")}
          confirmLabel={t("delete")}
          danger
          onConfirm={() => {
            if (confirming.kind === "state") void removeState(confirming.id);
            else void removeBattery();
          }}
          onClose={() => setConfirming(null)}
        >
          {confirming.kind === "battery"
            ? t("deleteBatteryBody")
            : t("cannotBeUndone")}
        </GpConfirm>
      )}
    </div>
  );
}
