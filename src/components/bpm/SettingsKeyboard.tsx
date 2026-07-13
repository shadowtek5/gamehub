"use client";

// Settings → Keyboard. GameHub mirrors the controller scheme on the keyboard;
// this documents the real key bindings as BPM-style info rows.

import { useTranslations } from "next-intl";
import { GpRow, GpSubHeader } from "./primitives";

function Binding({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="settings-row">
      <div className="text-[16px] text-body">{action}</div>
      <div className="rounded-[2px] bg-white/10 px-3 py-1 text-[14px] font-semibold text-bright">
        {keys}
      </div>
    </div>
  );
}

export default function SettingsKeyboard() {
  const t = useTranslations("settingsSysKb.keyboard");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <GpSubHeader>{t("shortcutsHeader")}</GpSubHeader>
        <Binding action={t("moveFocus")} keys={t("keysArrows")} />
        <Binding action={t("select")} keys={t("keysSelect")} />
        <Binding action={t("back")} keys={t("keysBack")} />
        <Binding action={t("toggleFavorite")} keys="X" />
        <Binding action={t("jumpToLibrary")} keys="Y" />
        <Binding action={t("mainMenu")} keys={t("keysMainMenu")} />
      </div>
      <div>
        <GpSubHeader>{t("onScreenHeader")}</GpSubHeader>
        <GpRow
          label={t("textEntry")}
          description={t("textEntryDesc")}
        />
      </div>
    </div>
  );
}
