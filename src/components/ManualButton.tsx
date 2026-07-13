"use client";

// Opens the (always-mounted) ManualViewer via the gh-open-manual event, so the
// manual works from any tab. Matches the Game Info button-row styling.

import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

export default function ManualButton() {
  const t = useTranslations("gameToolsMisc");
  return (
    <button
      onClick={() => {
        playSound("modalOpen");
        window.dispatchEvent(new Event("gh-open-manual"));
      }}
      className="cursor-pointer rounded bg-[#2a3540] px-6 py-3 text-sm font-semibold text-body transition-colors hover:bg-[#37434f] hover:text-bright"
    >
      📖 {t("shared.manual")}
    </button>
  );
}
