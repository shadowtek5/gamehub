"use client";

// Device saves for a game: emulator save data (PSP, Vita, 3DS, DS, …) that a
// handheld synced to GameHub with GameHub Downloader. Download the zip or
// delete GameHub's copy; the save on the device isn't touched.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatBytes } from "@/lib/format";
import { playSound } from "@/lib/sounds";
import { GpConfirm } from "@/components/bpm/primitives";

export interface DeviceSaveInfo {
  platform: string;
  key: string;
  title: string | null;
  device: string | null;
  size: number;
  updatedAt: string;
}

const IC = "h-[18px] w-[18px]";
const Stroke = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: IC };
const IconDownload = () => (<svg {...Stroke}><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 20h14" /></svg>);
const IconTrash = () => (<svg {...Stroke}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m1 0v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7" /></svg>);
const IconDevice = () => (<svg {...Stroke}><rect x="3" y="6" width="18" height="12" rx="3" /><path d="M8 10v4M6 12h4M15.5 11h.01M17.5 13h.01" /></svg>);

const ICON_BTN =
  "Focusable flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[3px] bg-[#acb2c9]/[0.14] text-body outline-none transition-colors hover:bg-[#acb2c9]/25 hover:text-bright focus:ring-2 focus:ring-inset focus:ring-white/70";

const url = (s: DeviceSaveInfo) => `/api/device-saves/${encodeURIComponent(s.platform)}/${encodeURIComponent(s.key)}`;

export default function DeviceSavesPanel({ initialSaves }: { initialSaves: DeviceSaveInfo[] }) {
  const [saves, setSaves] = useState(initialSaves);
  const [confirming, setConfirming] = useState<DeviceSaveInfo | null>(null);
  const t = useTranslations("gameMedia.deviceSaves");

  async function remove(s: DeviceSaveInfo) {
    const res = await fetch(url(s), { method: "DELETE" });
    if (res.ok) {
      playSound("confirm");
      setSaves((cur) => cur.filter((x) => !(x.platform === s.platform && x.key === s.key)));
    }
  }

  if (saves.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-dim">{t("intro")}</p>
      {saves.map((s) => (
        <div key={`${s.platform}/${s.key}`} className="flex items-center gap-3 rounded-[3px] bg-[#23262e] px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[3px] bg-white/[0.06] text-body">
            <IconDevice />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium text-bright">{s.title ?? s.key}</div>
            <div className="truncate text-[12px] text-dim">
              {t("meta", { system: s.platform.toUpperCase(), key: s.key, size: formatBytes(s.size), date: s.updatedAt.slice(0, 16).replace("T", " ") })}
              {s.device && ` · ${t("fromDevice", { device: s.device })}`}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href={url(s)} download className={ICON_BTN} title={t("download")} aria-label={t("download")}>
              <IconDownload />
            </a>
            <button onClick={() => setConfirming(s)} className={ICON_BTN} title={t("delete")} aria-label={t("delete")}>
              <IconTrash />
            </button>
          </div>
        </div>
      ))}
      {confirming && (
        <GpConfirm
          title={t("deleteConfirm")}
          confirmLabel={t("delete")}
          danger
          onConfirm={() => void remove(confirming)}
          onClose={() => setConfirming(null)}
        >
          {t("deleteBody")}
        </GpConfirm>
      )}
    </div>
  );
}
