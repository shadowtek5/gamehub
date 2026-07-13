"use client";

// The "Say something…" composer at the top of a game's Activity feed. Posts a
// status into the activity table, then refreshes so it appears in the feed.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

export default function ActivityComposer({ romId }: { romId: number }) {
  const t = useTranslations("activityComps.composer");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function post() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/roms/${romId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      if (res.ok) {
        playSound("confirm");
        setText("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    // Password-manager extensions (Dashlane, 1Password, …) inject data-* attrs
    // onto form fields after SSR but before hydration; suppressHydrationWarning
    // stops React warning about those extension-only attribute mismatches.
    <div className="flex items-center gap-2" suppressHydrationWarning>
      <input
        value={text}
        maxLength={1000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) void post();
        }}
        placeholder={t("placeholder")}
        className="input-dark min-w-0 flex-1 rounded-[3px] px-4 py-3 text-[14px]"
        suppressHydrationWarning
      />
      <button
        onClick={() => void post()}
        disabled={!text.trim() || busy}
        className="Focusable shrink-0 cursor-pointer rounded-[2px] bg-[#3d4450] px-5 py-3 text-[14px] font-semibold text-white outline-none transition-colors hover:bg-[#464e5c] focus:ring-2 focus:ring-inset focus:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40"
        suppressHydrationWarning
      >
        {busy ? t("posting") : t("post")}
      </button>
    </div>
  );
}
