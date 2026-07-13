"use client";

// The gamepad button on a game's play bar (left of the options cog): opens the
// game-scoped controller-layout editor. Styled to match the adjacent
// appdetailsplaysection_MenuButton_gh cog.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import ControllerLayout from "./ControllerLayout";

export default function ControllerLayoutButton({
  romId,
  title,
}: {
  romId: number;
  title: string;
}) {
  const t = useTranslations("controllerUi.button");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => {
          playSound("modalOpen");
          setOpen(true);
        }}
        className="appdetailsplaysection_MenuButton_gh flex h-12 w-12 cursor-pointer items-center justify-center rounded-[2px] bg-[#acb2c9]/[0.14] text-body transition-colors hover:bg-[#acb2c9]/25 hover:text-bright"
        aria-label={t("controllerLayout")}
        title={t("controllerLayout")}
      >
        {/* gamepad glyph (Lucide gamepad-2) */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[22px] w-[22px]"
        >
          <line x1="6" y1="11" x2="10" y2="11" />
          <line x1="8" y1="9" x2="8" y2="13" />
          <line x1="15" y1="12" x2="15.01" y2="12" />
          <line x1="18" y1="10" x2="18.01" y2="10" />
          <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
        </svg>
      </button>
      {open && (
        <ControllerLayout
          scope={{ kind: "game", romId }}
          title={t("titleWithGame", { title })}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
