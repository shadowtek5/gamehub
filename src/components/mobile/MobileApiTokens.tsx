"use client";

// Mobile API tokens — phone-native version of the desktop ApiTokens. Same
// /api/tokens endpoints; stacked full-width controls and cards.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpDropdown } from "@/components/bpm/primitives";

interface TokenRow {
  id: number;
  name: string;
  scope: string;
  created_at: string;
  last_used_at: string | null;
}

export default function MobileApiTokens() {
  const t = useTranslations("mobileAccount");
  // Ascending privilege, matching the desktop panel; least-privilege default.
  const SCOPES = [
    { value: "viewer", label: t("apiTokens.scopeViewer") },
    { value: "editor", label: t("apiTokens.scopeEditor") },
    { value: "full", label: t("apiTokens.scopeFull") },
  ];
  const EXPIRY = [
    { value: "90", label: t("apiTokens.expiry90") },
    { value: "30", label: t("apiTokens.expiry30") },
    { value: "365", label: t("apiTokens.expiry365") },
    { value: "0", label: t("apiTokens.expiryNever") },
  ];
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("viewer");
  const [expiry, setExpiry] = useState("90");
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function reload() {
    try {
      const res = await fetch("/api/tokens", { cache: "no-store" });
      const data = await res.json();
      setTokens(data.tokens ?? []);
    } catch {}
  }
  useEffect(() => {
    void reload();
  }, []);

  async function create() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scope, expiresInDays: Number(expiry) }),
      });
      const data = await res.json();
      if (res.ok) {
        playSound("confirm");
        setFresh({ name: data.name, token: data.token });
        setCopied(false);
        setName("");
        void reload();
      } else {
        setMsg(`✗ ${data.error ?? t("common.failed")}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: number) {
    await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    playSound("back");
    if (fresh) setFresh(null);
    void reload();
  }

  return (
    <div className="rounded-[12px] bg-[#1a1f27] p-4 ring-1 ring-white/5">
      <div className="text-[15px] font-bold text-bright">{t("apiTokens.apiTokens")}</div>
      <p className="mt-1 text-[12px] leading-relaxed text-dim">
        {t("apiTokens.tokensIntro1")}{" "}
        <code className="rounded bg-black/40 px-1 py-0.5 text-[11px]">Bearer</code> {t("apiTokens.tokensIntro2")}{" "}
        <code className="rounded bg-black/40 px-1 py-0.5 text-[11px]">Authorization</code> {t("apiTokens.tokensIntro3")}{" "}
        <a href="/api-docs" className="text-accent">
          {t("apiTokens.apiDocs")}
        </a>
      </p>

      {/* Create */}
      <div className="mt-3 flex flex-col gap-2">
        <input
          className="w-full rounded-[8px] bg-[#12161c] px-3 py-2.5 text-[15px] text-body ring-1 ring-white/10"
          placeholder={t("apiTokens.tokenNamePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <GpDropdown value={scope} width="100%" onChange={setScope} options={SCOPES} />
        <GpDropdown value={expiry} width="100%" onChange={setExpiry} options={EXPIRY} />
        <button
          onClick={create}
          disabled={busy || !name.trim()}
          className="w-full rounded-[8px] bg-accent py-2.5 text-[15px] font-semibold text-black disabled:opacity-40"
        >
          {busy ? t("apiTokens.creating") : t("apiTokens.createToken")}
        </button>
        {msg && <span className="text-[13px] text-danger">{msg}</span>}
      </div>

      {/* Freshly created token — shown once */}
      {fresh && (
        <div className="mt-3 rounded-[8px] bg-black/40 p-3 ring-1 ring-accent/40">
          <div className="text-[13px] text-body">
            <span className="font-semibold text-bright">{fresh.name}</span> {t("apiTokens.copyNow")}
          </div>
          <code className="mt-2 block break-all rounded bg-black/50 px-3 py-2 text-[12px] text-accent">
            {fresh.token}
          </code>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(fresh.token);
              setCopied(true);
            }}
            className="mt-2 w-full rounded-[8px] bg-[#232a34] py-2 text-[14px] font-semibold text-body active:bg-[#2c3540]"
          >
            {copied ? `✓ ${t("apiTokens.copied")}` : t("apiTokens.copyToken")}
          </button>
        </div>
      )}

      {/* Existing tokens */}
      {tokens && tokens.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {tokens.map((tok) => (
            <div key={tok.id} className="rounded-[8px] bg-black/25 p-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-body">{tok.name}</span>
                {tok.scope !== "full" && (
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dim">
                    {tok.scope === "viewer" ? t("apiTokens.scopeViewer") : t("apiTokens.editorBadge")}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[11px] text-dim">
                  {t("apiTokens.createdDate", { date: tok.created_at.slice(0, 10) })}
                  {tok.last_used_at
                    ? ` · ${t("apiTokens.usedDate", { date: tok.last_used_at.slice(0, 10) })}`
                    : ` · ${t("apiTokens.neverUsed")}`}
                </span>
                <button
                  onClick={() => revoke(tok.id)}
                  className="shrink-0 rounded-[6px] bg-[#232a34] px-3 py-1.5 text-[12px] font-semibold text-body active:bg-[#3a2020]"
                >
                  {t("apiTokens.revoke")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {tokens && tokens.length === 0 && !fresh && (
        <p className="mt-3 text-[12px] text-dim">{t("apiTokens.noTokensYet")}</p>
      )}
    </div>
  );
}
