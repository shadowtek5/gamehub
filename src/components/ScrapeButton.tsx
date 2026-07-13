"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ScrapeOutcome } from "@/lib/providers/scrape";

export default function ScrapeButton({ romId }: { romId: number }) {
  const t = useTranslations("scrapeTools");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function scrape() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/roms/${romId}/scrape`, { method: "POST" });
      const outcome: ScrapeOutcome = await res.json();
      if (outcome.ok) {
        setMsg(
          t("button.got", {
            got: outcome.got.join(", ") || t("button.metadata"),
            sources: outcome.sources.join(" + "),
          })
        );
        router.refresh();
      } else {
        setMsg(`✗ ${outcome.error ?? t("button.nothingFound")}`);
      }
    } catch (e) {
      setMsg(`✗ ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-3">
      <button
        onClick={scrape}
        disabled={busy}
        className="btn-gray cursor-pointer px-4 py-2 text-xs disabled:opacity-50"
      >
        {busy ? t("common.scraping") : t("button.scrapeMetadata")}
      </button>
      {msg && <span className="text-xs text-body">{msg}</span>}
    </span>
  );
}
