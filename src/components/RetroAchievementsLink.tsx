"use client";

// Per-user RetroAchievements account link, shown in the profile editor's
// Connections section. Link with your RA username + Web API key (found at
// retroachievements.org → Settings → Keys). GameHub stores the sealed key and
// uses it to show your achievement lists and unlock progress on game pages.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpButton } from "@/components/bpm/primitives";

interface RaLink {
  linked: boolean;
  username?: string;
}

export default function RetroAchievementsLink() {
  const [link, setLink] = useState<RaLink | null>(null);
  const [username, setUsername] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const t = useTranslations("achievements.raLink");

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
        setMsg(`✗ ${data.error ?? t("failed")}`);
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
    <div className="rounded-[3px] bg-[#22262c] px-6 py-5">
      <div className="text-[17px] text-bright">{t("title")}</div>
      <div className="mt-0.5 text-sm text-dim">
        {t.rich("linkDescription", {
          link: (chunks) => (
            <a
              href="https://retroachievements.org"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {chunks}
            </a>
          ),
        })}
      </div>

      {link === null ? (
        <p className="mt-3 text-xs text-dim">{t("loading")}</p>
      ) : link.linked ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-body">
              {t("linkedAs")} <span className="font-semibold text-bright">{link.username}</span>
            </span>
            <GpButton onClick={unlink} className="!py-1 text-xs">
              {t("unlink")}
            </GpButton>
          </div>
          <p className="mt-4 text-sm text-dim">
            {t("credentialsNote")}
          </p>
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              className="input-dark w-48 px-3 py-2 text-sm"
              placeholder={t("usernamePlaceholder")}
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              className="input-dark w-64 px-3 py-2 text-sm"
              type="password"
              placeholder={t("apiKeyPlaceholder")}
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && username && apiKey && linkAccount()}
            />
            <GpButton
              primary
              onClick={linkAccount}
              disabled={busy || !username || !apiKey}
              className="text-sm"
            >
              {t("linkAccount")}
            </GpButton>
            {msg && <span className="text-sm text-danger">{msg}</span>}
          </div>
          <p className="mt-2 text-xs text-dim">
            {t("findKeyHint")}
          </p>
        </>
      )}
    </div>
  );
}
