"use client";

// Personal API tokens (account page): create, list, revoke. The token value
// is shown exactly once — only its hash is stored server-side.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpDropdown, GpButton } from "@/components/bpm/primitives";

interface TokenRow {
  id: number;
  name: string;
  scope: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export default function ApiTokens() {
  const t = useTranslations("accountAdmin.apiTokens");
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("full");
  const [expiry, setExpiry] = useState("0");
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
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tokens", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) setTokens(data.tokens ?? []);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
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
        setMsg(`✗ ${data.error ?? t("failed")}`);
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
    <div className="rounded-[3px] bg-[#22262c] px-6 py-5">
      <div className="text-[17px] text-bright">{t("title")}</div>
      <div className="mt-0.5 text-sm text-dim">
        {t("descPrefix")}{" "}
        <code className="rounded bg-black/40 px-1.5 py-0.5 text-xs">
          Authorization: Bearer &lt;token&gt;
        </code>{" "}
        {t("descSuffix")}{" "}
        <a href="/api-docs" className="text-accent hover:underline">
          {t("browseDocs")}
        </a>
      </div>

      <div className="gamepaddialog_Field_gh mt-4"><div className="gamepaddialog_FieldChildren_gh flex flex-wrap items-center gap-2">
        <input
          className="input-dark w-56 px-3 py-2 text-sm"
          placeholder={t("namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <GpDropdown
          value={scope}
          width={200}
          onChange={setScope}
          options={[
            { value: "full", label: t("scopeFull") },
            { value: "editor", label: t("scopeEditor") },
            { value: "viewer", label: t("readOnly") },
          ]}
        />
        <GpDropdown
          value={expiry}
          width={170}
          onChange={setExpiry}
          options={[
            { value: "0", label: t("expiryNever") },
            { value: "30", label: t("expiry30") },
            { value: "90", label: t("expiry90") },
            { value: "365", label: t("expiry365") },
          ]}
        />
        <GpButton primary onClick={create} disabled={busy} className="text-sm">
          {t("createToken")}
        </GpButton>
        {msg && <span className="text-sm text-danger">{msg}</span>}
      </div></div>

      {fresh && (
        <div className="mt-3 rounded-[3px] bg-black/40 p-4 ring-1 ring-accent/40">
          <div className="text-sm text-body">
            <span className="font-semibold text-bright">{fresh.name}</span> {t("copyNow")}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-black/50 px-3 py-2 text-xs text-accent">
              {fresh.token}
            </code>
            <GpButton
              onClick={() => {
                void navigator.clipboard?.writeText(fresh.token);
                setCopied(true);
              }}
              className="!py-1.5 text-xs"
            >
              {copied ? t("copied") : t("copy")}
            </GpButton>
          </div>
        </div>
      )}

      {tokens && tokens.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5">
          {tokens.map((row) => (
            <div
              key={row.id}
              className="gamepaddialog_Field_gh flex items-center gap-4 rounded-[3px] bg-black/25 px-4 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-body">{row.name}</span>
              {row.scope !== "full" && (
                <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dim">
                  {row.scope === "viewer" ? t("readOnly") : t("editor")}
                </span>
              )}
              {row.expires_at &&
                (new Date(row.expires_at) < new Date() ? (
                  <span className="shrink-0 rounded bg-danger/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger">
                    {t("expired")}
                  </span>
                ) : (
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dim">
                    {t("expiresOn", { date: row.expires_at.slice(0, 10) })}
                  </span>
                ))}
              <span className="shrink-0 text-xs text-dim">
                {t("createdOn", { date: row.created_at.slice(0, 10) })}
                {row.last_used_at
                  ? t("lastUsed", { time: row.last_used_at.slice(0, 16).replace("T", " ") })
                  : t("neverUsed")}
              </span>
              <GpButton onClick={() => revoke(row.id)} className="shrink-0 !py-1 text-xs">
                {t("revoke")}
              </GpButton>
            </div>
          ))}
        </div>
      )}
      {tokens && tokens.length === 0 && !fresh && (
        <p className="mt-3 text-xs text-dim">{t("noTokens")}</p>
      )}
    </div>
  );
}
