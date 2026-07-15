"use client";

// Per-game video filter (shader) picker. Saves the choice to the user's
// per-game emulator prefs; it's applied to EmulatorJS the next time the game is
// launched. Shown on the game page for playable systems.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GpDropdown } from "@/components/bpm/primitives";
import { SHADERS } from "@/lib/shaders";

export default function VideoFilterPicker({
  romId,
  initialShader,
}: {
  romId: number;
  initialShader: string | null;
}) {
  const t = useTranslations("emuVideo");
  const [value, setValue] = useState(initialShader ?? "disabled");
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    setValue(next);
    setSaving(true);
    try {
      await fetch(`/api/roms/${romId}/emu-prefs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shader: next }),
      });
    } finally {
      setSaving(false);
    }
  }

  const options = SHADERS.map((s) => ({ value: s.value, label: s.key ? t(s.key) : s.label ?? s.value }));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[14px] text-body">{t("videoFilter")}</span>
      <GpDropdown value={value} width={200} options={options} onChange={change} />
      <span className="text-[12px] text-dim">{saving ? t("saving") : t("appliesNextLaunch")}</span>
    </div>
  );
}
