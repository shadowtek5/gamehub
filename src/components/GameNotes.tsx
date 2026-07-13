"use client";

// YOUR STUFF → Notes: a private scratchpad for a game. Steam-feel dark field;
// auto-saves ~0.8s after you stop typing (and on blur), no Save button.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function GameNotes({
  romId,
  initial,
}: {
  romId: number;
  initial: string | null;
}) {
  const t = useTranslations("gameTabs");
  const [notes, setNotes] = useState(initial ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const router = useRouter();
  const latest = useRef(notes);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const save = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setStatus("saving");
    await fetch(`/api/roms/${romId}/personal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: latest.current.trim() || null }),
    });
    setStatus("saved");
    router.refresh();
    window.setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1500);
  }, [romId, router]);

  function onChange(v: string) {
    setNotes(v);
    latest.current = v;
    dirty.current = true;
    setStatus("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), 800);
  }

  // flush a pending save on unmount
  useEffect(() => () => { window.clearTimeout(timer.current); void save(); }, [save]);

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="input-dark min-h-32 w-full resize-y rounded-[3px] px-3 py-2 text-[14px] leading-relaxed"
        placeholder={t("notes.placeholder")}
        value={notes}
        maxLength={5000}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { window.clearTimeout(timer.current); void save(); }}
      />
      <div className="flex h-4 items-center px-1">
        <span className="text-[12px] text-dim">{t("shared.onlyYou")}</span>
        <span className="ml-auto text-[12px] text-accent">
          {status === "saving" ? t("notes.saving") : status === "saved" ? t("shared.saved") : ""}
        </span>
      </div>
    </div>
  );
}
