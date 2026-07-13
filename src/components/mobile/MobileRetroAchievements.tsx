"use client";

// Mobile per-user RetroAchievements link — phone-native version of the desktop
// RetroAchievementsLink, styled to match MobileApiTokens. The user pastes their
// RA Web API key; it's validated + sealed server-side and this UI only ever
// sees {linked, username}.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

interface RaLink {
  linked: boolean;
  username?: string;
}

export default function MobileRetroAchievements() {
  const t = useTranslations("mobileAccount");
  const [link, setLink] = useState<RaLink | null>(null);
  const [username, setUsername] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function reload() {
    try {
      const res = await fetch("/api/account/retroachievements", { cache: "no-store" });
      setLink(await res.json());
    } catch {}
  }
  useEffect(() => {
    void reload();
  }, []);

  async function linkAccount() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/account/retroachievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, apiKey }),
      });
      const data = await res.json();
      if (res.ok) {
        playSound("confirm");
        setUsername("");
        setApiKey("");
        setLink(data);
      } else {
        setMsg(`✗ ${data.error ?? t("common.failed")}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    await fetch("/api/account/retroachievements", { method: "DELETE" });
    playSound("back");
    void reload();
  }

  return (
    <div className="rounded-[12px] bg-[#1a1f27] p-4 ring-1 ring-white/5">
      <div className="text-[15px] font-bold text-bright">RetroAchievements</div>
      <p className="mt-1 text-[12px] leading-relaxed text-dim">
        {t("retroAchievements.raIntro1")}{" "}
        <a href="https://retroachievements.org" target="_blank" rel="noreferrer" className="text-accent">
          RetroAchievements
        </a>{" "}
        {t("retroAchievements.raIntro2")}
      </p>

      {link === null ? (
        <p className="mt-3 text-[12px] text-dim">{t("retroAchievements.loading")}</p>
      ) : link.linked ? (
        <>
          <div className="mt-3 rounded-[8px] bg-black/25 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-[14px] text-body">
                {t("retroAchievements.linkedAs")} <span className="font-semibold text-bright">{link.username}</span>
              </span>
              <button
                onClick={unlink}
                className="shrink-0 rounded-[6px] bg-[#232a34] px-3 py-1.5 text-[12px] font-semibold text-body active:bg-[#3a2020]"
              >
                {t("retroAchievements.unlink")}
              </button>
            </div>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-dim">
            {t("retroAchievements.raLinkedNote")}
          </p>
        </>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <input
            className="w-full rounded-[8px] bg-[#12161c] px-3 py-2.5 text-[15px] text-body ring-1 ring-white/10"
            placeholder={t("retroAchievements.raUsernamePlaceholder")}
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="w-full rounded-[8px] bg-[#12161c] px-3 py-2.5 text-[15px] text-body ring-1 ring-white/10"
            type="password"
            placeholder={t("retroAchievements.webApiKeyPlaceholder")}
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button
            onClick={linkAccount}
            disabled={busy || !username || !apiKey}
            className="w-full rounded-[8px] bg-accent py-2.5 text-[15px] font-semibold text-black disabled:opacity-40"
          >
            {busy ? t("retroAchievements.linking") : t("retroAchievements.linkAccount")}
          </button>
          <p className="text-[11px] leading-relaxed text-dim">
            {t("retroAchievements.findKeyHint")}
          </p>
          {msg && <span className="text-[13px] text-danger">{msg}</span>}
        </div>
      )}
    </div>
  );
}
