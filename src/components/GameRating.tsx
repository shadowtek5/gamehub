"use client";

// YOUR STUFF → Your rating: personal rating, difficulty, and completion %.
// Steam-feel Field rows on lifted panels; every change auto-saves (no Save
// button), with a subtle "Saved" flash.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpSlider } from "@/components/bpm/primitives";

// A 1–10 star field row. Hoisted to module scope (defining it inside the
// component would remount it — and reset focus — on every render).
function StarRow({
  label,
  value,
  set,
  field,
  patch,
}: {
  label: string;
  value: number;
  set: (v: number) => void;
  field: "rating" | "difficulty";
  patch: (body: Record<string, number | null>) => void;
}) {
  return (
    <div className="gamepaddialog_Field_gh flex items-center gap-4 rounded-[3px] bg-white/[0.04] px-4 py-3">
      <span className="gamepaddialog_FieldLabel_gh w-24 shrink-0 text-[13px] font-bold uppercase tracking-[0.5px] text-[#b8bcbf]">
        {label}
      </span>
      <span className="flex flex-1 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => {
              const next = value === n ? 0 : n;
              playSound("navigate");
              set(next);
              void patch({ [field]: next || null });
            }}
            title={`${n}/10`}
            className={`Focusable cursor-pointer text-[18px] leading-none outline-none transition-colors focus:scale-110 ${
              n <= value ? "text-accent" : "text-white/15 hover:text-white/40"
            }`}
          >
            ★
          </button>
        ))}
      </span>
      <span className="w-10 shrink-0 text-right text-[13px] tabular-nums text-dim">
        {value ? `${value}/10` : "—"}
      </span>
    </div>
  );
}

export default function GameRating({
  romId,
  initial,
}: {
  romId: number;
  initial: { rating: number | null; difficulty: number | null; completion: number | null };
}) {
  const [rating, setRating] = useState(initial.rating ?? 0);
  const [difficulty, setDifficulty] = useState(initial.difficulty ?? 0);
  const [completion, setCompletion] = useState(initial.completion ?? 0);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const t = useTranslations("gameTabs");

  async function patch(body: Record<string, number | null>) {
    await fetch(`/api/roms/${romId}/personal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <StarRow label={t("rating.rating")} value={rating} set={setRating} field="rating" patch={patch} />
      <StarRow label={t("rating.difficulty")} value={difficulty} set={setDifficulty} field="difficulty" patch={patch} />
      <div className="gamepaddialog_Field_gh flex items-center gap-4 rounded-[3px] bg-white/[0.04] px-4 py-3">
        <span className="gamepaddialog_FieldLabel_gh w-24 shrink-0 text-[13px] font-bold uppercase tracking-[0.5px] text-[#b8bcbf]">
          {t("rating.completion")}
        </span>
        <div className="flex flex-1 items-center">
          <GpSlider
            value={completion}
            onChange={setCompletion}
            onCommit={(v) => void patch({ completion: v || null })}
            min={0}
            max={100}
            step={5}
            width={260}
            label={t("rating.completion")}
          />
        </div>
        <span className="w-10 shrink-0 text-right text-[13px] tabular-nums text-dim">{completion}%</span>
      </div>
      <div className="flex h-4 items-center px-1">
        <span className="text-[12px] text-dim">{t("shared.onlyYou")}</span>
        <span className={`ml-auto text-[12px] text-accent transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>
          {t("shared.saved")}
        </span>
      </div>
    </div>
  );
}
