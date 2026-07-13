"use client";

// The dropdown half of the split Play button (Steam's play-options chevron).
// Opens the game options modal via a window event GameOptionsModal listens for.

import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

export default function PlayOptionsChevron() {
  const t = useTranslations("related");
  return (
    <button
      type="button"
      onClick={() => {
        playSound("modalOpen");
        window.dispatchEvent(new Event("gh-open-game-options"));
      }}
      className="appactionbutton_ButtonChild_gh flex h-full w-6 shrink-0 items-center justify-center border-l border-black/25 text-[11px] text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      aria-label={t("playOptions.gameOptions")}
      title={t("playOptions.gameOptions")}
    >
      ▾
    </button>
  );
}
