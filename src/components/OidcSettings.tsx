"use client";

// Admin OIDC configuration on the settings pattern: an enable toggle row
// that persists immediately, and a Configure modal for issuer/client/label.

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { OidcConfig } from "@/lib/oidc";
import { playSound } from "@/lib/sounds";
import { GpSubHeader, GpButton, GpToggle, GpModal } from "./bpm/primitives";

export default function OidcSettings({ initial }: { initial: OidcConfig }) {
  const t = useTranslations("accountAdmin.oidc");
  const [config, setConfig] = useState(initial);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");

  function set<K extends keyof OidcConfig>(key: K, value: OidcConfig[K]) {
    setConfig((cur) => ({ ...cur, [key]: value }));
  }

  async function persist(next: OidcConfig) {
    const res = await fetch("/api/settings/oidc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    return res.ok;
  }

  async function toggleEnabled(on: boolean) {
    const next = { ...config, enabled: on };
    setConfig(next);
    await persist(next);
  }

  const label = "text-[12px] font-bold uppercase tracking-[0.5px] text-dim";
  const redirect =
    typeof window !== "undefined" ? `${window.location.origin}/api/auth/oidc/callback` : "";

  return (
    <div>
      <GpSubHeader>{t("singleSignOn")}</GpSubHeader>
      <div className="settings-row">
        <div className="min-w-0">
          <div className="text-[16px] text-body">{t("enableSsoLogin")}</div>
          <div className="mt-1 text-[12px] text-dim">
            {t("enableSsoDesc")}
          </div>
        </div>
        <GpToggle on={config.enabled} onChange={toggleEnabled} label={t("enableSso")} />
      </div>
      <div className="settings-row">
        <div className="min-w-0">
          <div className="text-[16px] text-body">{t("providerConfig")}</div>
          <div className="mt-1 text-[12px] text-dim">
            {config.issuer ? config.issuer : t("providerConfigDesc")}
          </div>
        </div>
        <GpButton primary onClick={() => { setMsg(""); setOpen(true); }}>{t("configure")}</GpButton>
      </div>

      {open && (
        <GpModal
          title={t("modalTitle")}
          width={620}
          onClose={() => setOpen(false)}
          footer={
            <>
              <GpButton onClick={() => setOpen(false)}>{t("cancel")}</GpButton>
              <GpButton
                primary
                onClick={async () => {
                  if (await persist(config)) {
                    playSound("confirm");
                    setOpen(false);
                  } else setMsg(t("failedToSave"));
                }}
              >
                {t("save")}
              </GpButton>
            </>
          }
        >
          <div className="flex flex-col gap-4 py-2">
            <p className="text-[13px] leading-relaxed text-dim">
              {t("redirectUriLabel")}{" "}
              <code className="rounded bg-black/40 px-1.5 py-0.5 text-[12px] text-body">{redirect}</code>
            </p>
            <label className="flex flex-col gap-1.5">
              <span className={label}>{t("issuerUrl")}</span>
              <input
                className="input-dark rounded-[2px] px-3 py-2 text-[15px]"
                placeholder="https://auth.example.com/application/o/gamehub/"
                value={config.issuer}
                onChange={(e) => set("issuer", e.target.value)}
                autoComplete="off"
                data-form-type="other"
              />
              <span className="text-[12px] text-dim">{t("discoveryHint")}</span>
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className={label}>{t("clientId")}</span>
                <input className="input-dark rounded-[2px] px-3 py-2 text-[15px]" value={config.clientId} onChange={(e) => set("clientId", e.target.value)} autoComplete="off" data-form-type="other" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={label}>{t("clientSecret")}</span>
                <input type="password" className="input-dark rounded-[2px] px-3 py-2 text-[15px]" value={config.clientSecret} onChange={(e) => set("clientSecret", e.target.value)} autoComplete="new-password" data-form-type="other" />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className={label}>{t("buttonLabel")}</span>
              <input className="input-dark rounded-[2px] px-3 py-2 text-[15px]" placeholder={t("singleSignOn")} value={config.label} onChange={(e) => set("label", e.target.value)} />
            </label>
            <div className="flex items-center justify-between">
              <span className="text-[15px] text-body">{t("autoCreateLabel")}</span>
              <GpToggle on={config.autoCreate} onChange={(v) => set("autoCreate", v)} label={t("autoCreateToggle")} />
            </div>
            {msg && <div className="text-[13px] text-danger">{msg}</div>}
          </div>
        </GpModal>
      )}
    </div>
  );
}
