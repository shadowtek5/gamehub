"use client";

// Emulation compatibility (Deck-Verified / ProtonDB style) on the game page.
// Shows a consensus badge (official pin wins over the crowd mode), a counts bar,
// the user's own report (Playable / Runs / Broken + note), and an admin control
// to pin an official rating. Backed by /api/roms/[id]/compat.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import type { CompatRating, CompatSummary, CompatReportRow } from "@/lib/db";

const COLORS: Record<CompatRating, string> = {
  playable: "#59bf40",
  runs: "#d9a441",
  broken: "#e0625f",
};
const UNKNOWN = "#6b7280";
const LABEL_KEY: Record<CompatRating, string> = {
  playable: "labelPlayable",
  runs: "labelRuns",
  broken: "labelBroken",
};
const ORDER: CompatRating[] = ["playable", "runs", "broken"];

interface State {
  summary: CompatSummary;
  mine: CompatReportRow | null;
}

export default function Compatibility({
  romId,
  isAdmin,
  initial,
}: {
  romId: number;
  isAdmin: boolean;
  initial: State;
}) {
  const t = useTranslations("compat");
  const [state, setState] = useState<State>(initial);
  const [rating, setRating] = useState<CompatRating | null>(initial.mine?.rating ?? null);
  const [note, setNote] = useState(initial.mine?.note ?? "");
  const [busy, setBusy] = useState(false);

  const label = (r: CompatRating | null) => (r ? t(LABEL_KEY[r]) : t("labelUnknown"));
  const color = (r: CompatRating | null) => (r ? COLORS[r] : UNKNOWN);

  async function send(payload: object, sound: "confirm" | "back") {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/roms/${romId}/compat`, {
        method: payload === null ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: payload === null ? undefined : JSON.stringify(payload),
      });
      if (res.ok) {
        playSound(sound);
        setState(await res.json());
      }
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (rating === null) return;
    await send({ rating, note }, "confirm");
  }
  async function removeMine() {
    await send(null as unknown as object, "back");
    setRating(null);
    setNote("");
  }
  async function setOfficial(off: CompatRating | null) {
    await send({ official: off }, "confirm");
  }

  const { summary } = state;
  const consensus = summary.consensus;

  const toggleBtn = (r: CompatRating) =>
    `Focusable flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[4px] px-3 py-2.5 text-[13px] font-semibold outline-none ring-1 transition-colors focus:ring-2 focus:ring-white ${
      rating === r
        ? "text-[color:var(--c)] ring-[color:var(--c)]/60"
        : "bg-[#23262e] text-body ring-white/10 hover:bg-[#2b2f38]"
    }`;

  return (
    <div className="flex flex-col gap-5">
      {/* Consensus badge */}
      <div className="flex items-center gap-3">
        <span
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-bold"
          style={{ backgroundColor: `${color(consensus)}22`, color: color(consensus) }}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color(consensus) }} />
          {label(consensus)}
        </span>
        <span className="text-[12px] text-dim">
          {summary.official
            ? t("officialBadge")
            : summary.total > 0
              ? t("reportsCount", { count: summary.total })
              : t("untestedHint")}
        </span>
      </div>

      {/* Counts bar */}
      {summary.total > 0 && (
        <div>
          <div className="flex h-2 overflow-hidden rounded-full bg-[#23262e]">
            {ORDER.map((r) =>
              summary.counts[r] > 0 ? (
                <span
                  key={r}
                  style={{ backgroundColor: COLORS[r], width: `${(summary.counts[r] / summary.total) * 100}%` }}
                />
              ) : null
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-dim">
            {ORDER.map((r) => (
              <span key={r} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[r] }} />
                {t(LABEL_KEY[r])} · {summary.counts[r]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Your report */}
      <div className="rounded-[6px] bg-[#1b1f27] p-4 ring-1 ring-white/5">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-wide text-dim">{t("yourReport")}</div>
        <div className="mb-3 flex gap-2">
          {ORDER.map((r) => (
            <button
              key={r}
              onClick={() => setRating(r)}
              className={toggleBtn(r)}
              style={{ ["--c" as string]: COLORS[r] }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[r] }} />
              {t(LABEL_KEY[r])}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("notePlaceholder")}
          rows={2}
          maxLength={2000}
          className="w-full resize-y rounded-[4px] bg-[#12161c] px-3 py-2 text-[14px] text-bright outline-none ring-1 ring-white/10 placeholder:text-dim focus:ring-2 focus:ring-white"
        />
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={submit}
            disabled={rating === null || busy}
            className="Focusable cursor-pointer rounded-[3px] bg-accent px-5 py-2 text-[14px] font-semibold text-black outline-none transition-opacity hover:opacity-90 focus:ring-2 focus:ring-white disabled:opacity-40"
          >
            {state.mine ? t("update") : t("save")}
          </button>
          {state.mine && (
            <button
              onClick={removeMine}
              disabled={busy}
              className="Focusable cursor-pointer rounded-[3px] bg-[#3d4450] px-4 py-2 text-[14px] font-semibold text-white outline-none transition-colors hover:bg-[#c0392b] focus:ring-2 focus:ring-white disabled:opacity-50"
            >
              {t("clear")}
            </button>
          )}
        </div>
      </div>

      {/* Admin: official rating */}
      {isAdmin && (
        <div className="rounded-[6px] bg-[#1b1f27] p-4 ring-1 ring-white/5">
          <div className="mb-3 text-[13px] font-bold uppercase tracking-wide text-dim">{t("officialLabel")}</div>
          <div className="flex flex-wrap gap-2">
            {ORDER.map((r) => (
              <button
                key={r}
                onClick={() => setOfficial(r)}
                disabled={busy}
                className={`Focusable cursor-pointer rounded-[4px] px-3 py-2 text-[13px] font-semibold outline-none ring-1 transition-colors focus:ring-2 focus:ring-white disabled:opacity-50 ${
                  summary.official === r ? "ring-2" : "bg-[#23262e] text-body ring-white/10 hover:bg-[#2b2f38]"
                }`}
                style={summary.official === r ? { color: COLORS[r], ["--tw-ring-color" as string]: COLORS[r] } : undefined}
              >
                {t(LABEL_KEY[r])}
              </button>
            ))}
            <button
              onClick={() => setOfficial(null)}
              disabled={busy || !summary.official}
              className="Focusable cursor-pointer rounded-[4px] bg-[#23262e] px-3 py-2 text-[13px] font-semibold text-dim outline-none ring-1 ring-white/10 transition-colors hover:bg-[#2b2f38] hover:text-body focus:ring-2 focus:ring-white disabled:opacity-40"
            >
              {t("clearOfficial")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
