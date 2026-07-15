"use client";

// Community reviews on the game page (Steam-style): an aggregate recommend %,
// your own thumbs up/down + optional blurb (editable), and everyone else's
// reviews. Backed by /api/roms/[id]/reviews.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { timeAgo } from "@/lib/format";
import { playSound } from "@/lib/sounds";
import type { ReviewRow, ReviewSummary } from "@/lib/db";

const ThumbUp = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M2 10h4v11H2zM22 11a2 2 0 0 0-2-2h-5.5l.9-4.3.03-.3a1.5 1.5 0 0 0-.44-1.06L14 2.5 7.6 8.9A2 2 0 0 0 7 10.3V19a2 2 0 0 0 2 2h8.1a2 2 0 0 0 1.85-1.25l3-7A2 2 0 0 0 22 11z" />
  </svg>
);
const ThumbDown = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M22 14h-4V3h4zM2 13a2 2 0 0 0 2 2h5.5l-.9 4.3-.03.3a1.5 1.5 0 0 0 .44 1.06L10 21.5l6.4-6.4A2 2 0 0 0 17 13.7V5a2 2 0 0 0-2-2H6.9A2 2 0 0 0 5.05 4.25l-3 7A2 2 0 0 0 2 13z" />
  </svg>
);

interface ApiState {
  summary: ReviewSummary;
  reviews: ReviewRow[];
  mine: ReviewRow | null;
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3d4450] text-[13px] font-black text-white">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function Reviews({
  romId,
  currentUserId,
  initial,
}: {
  romId: number;
  currentUserId: number;
  initial: ApiState;
}) {
  const t = useTranslations("reviews");
  const [state, setState] = useState<ApiState>(initial);
  // Editor: seed from the existing review.
  const [rec, setRec] = useState<boolean | null>(initial.mine ? initial.mine.recommended === 1 : null);
  const [body, setBody] = useState(initial.mine?.body ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (rec === null || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/roms/${romId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommended: rec, body }),
      });
      if (res.ok) {
        playSound("confirm");
        setState(await res.json());
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeMine() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/roms/${romId}/reviews`, { method: "DELETE" });
      if (res.ok) {
        playSound("back");
        setState(await res.json());
        setRec(null);
        setBody("");
      }
    } finally {
      setBusy(false);
    }
  }

  const { summary, reviews, mine } = state;
  const others = reviews.filter((r) => r.userId !== currentUserId);

  const toggle = (value: boolean) =>
    `Focusable flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[4px] px-4 py-2.5 text-[14px] font-semibold outline-none ring-1 transition-colors focus:ring-2 focus:ring-white ${
      rec === value
        ? value
          ? "bg-[#59bf40]/20 text-[#59bf40] ring-[#59bf40]/50"
          : "bg-[#e0625f]/20 text-[#e0625f] ring-[#e0625f]/50"
        : "bg-[#23262e] text-body ring-white/10 hover:bg-[#2b2f38]"
    }`;

  return (
    <div className="flex flex-col gap-6">
      {/* Aggregate */}
      <div className="flex items-center gap-3">
        {summary.pct === null ? (
          <span className="text-[15px] text-dim">{t("noneYet")}</span>
        ) : (
          <>
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{
                backgroundColor: summary.pct >= 70 ? "rgba(89,191,64,0.18)" : summary.pct >= 40 ? "rgba(217,164,65,0.18)" : "rgba(224,98,95,0.18)",
                color: summary.pct >= 70 ? "#59bf40" : summary.pct >= 40 ? "#d9a441" : "#e0625f",
              }}
            >
              <ThumbUp className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[17px] font-bold text-bright">
                {t("recommendedPct", { pct: summary.pct })}
              </div>
              <div className="text-[12px] text-dim">
                {t("basedOn", { count: summary.total, recommended: summary.recommended })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Your review */}
      <div className="rounded-[6px] bg-[#1b1f27] p-4 ring-1 ring-white/5">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-wide text-dim">
          {mine ? t("yourReview") : t("writeReview")}
        </div>
        <div className="mb-3 flex gap-2">
          <button onClick={() => setRec(true)} className={toggle(true)}>
            <ThumbUp className="h-4 w-4" /> {t("recommend")}
          </button>
          <button onClick={() => setRec(false)} className={toggle(false)}>
            <ThumbDown className="h-4 w-4" /> {t("notRecommend")}
          </button>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("bodyPlaceholder")}
          rows={3}
          maxLength={4000}
          className="w-full resize-y rounded-[4px] bg-[#12161c] px-3 py-2 text-[14px] text-bright outline-none ring-1 ring-white/10 placeholder:text-dim focus:ring-2 focus:ring-white"
        />
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={submit}
            disabled={rec === null || busy}
            className="Focusable cursor-pointer rounded-[3px] bg-accent px-5 py-2 text-[14px] font-semibold text-black outline-none transition-opacity hover:opacity-90 focus:ring-2 focus:ring-white disabled:opacity-40"
          >
            {mine ? t("update") : t("post")}
          </button>
          {mine && (
            <button
              onClick={removeMine}
              disabled={busy}
              className="Focusable cursor-pointer rounded-[3px] bg-[#3d4450] px-4 py-2 text-[14px] font-semibold text-white outline-none transition-colors hover:bg-[#c0392b] focus:ring-2 focus:ring-white disabled:opacity-50"
            >
              {t("delete")}
            </button>
          )}
        </div>
      </div>

      {/* Everyone else */}
      {others.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-[13px] font-bold uppercase tracking-wide text-dim">
            {t("communityReviews", { count: others.length })}
          </div>
          {others.map((r) => (
            <div key={r.id} className="flex gap-3 rounded-[6px] bg-[#1b1f27] p-3.5 ring-1 ring-white/5">
              <Avatar name={r.authorName} url={r.authorAvatar} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: r.recommended ? "rgba(89,191,64,0.18)" : "rgba(224,98,95,0.18)",
                      color: r.recommended ? "#59bf40" : "#e0625f",
                    }}
                  >
                    {r.recommended ? <ThumbUp className="h-3 w-3" /> : <ThumbDown className="h-3 w-3" />}
                  </span>
                  <span className="truncate text-[14px] font-semibold text-bright">{r.authorName}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-dim">
                    {timeAgo(r.updated_at ?? r.created_at)}
                  </span>
                </div>
                {r.body && (
                  <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-body">{r.body}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
