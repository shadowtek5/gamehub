"use client";

// Registration control: open-registration toggle + single-use invite links
// with a pre-assigned role (7-day expiry).

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpSubHeader, GpButton, GpToggle, GpDropdown } from "./bpm/primitives";

interface InviteRow {
  token: string;
  role: string;
  created_at: string;
  expires_at: string;
}

export default function InvitesPanel() {
  const t = useTranslations("accountAdmin.invites");
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [role, setRole] = useState("viewer");
  const [copied, setCopied] = useState("");

  async function reload() {
    try {
      const res = await fetch("/api/invites", { cache: "no-store" });
      const data = await res.json();
      setInvites(data.invites ?? []);
      setRegistrationOpen(data.registrationOpen !== false);
    } catch {}
  }
  useEffect(() => {
    void reload();
  }, []);

  async function toggleRegistration() {
    const next = !registrationOpen;
    playSound(next ? "toggleOn" : "toggleOff");
    setRegistrationOpen(next);
    await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationOpen: next }),
    });
  }

  async function createInvite() {
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      playSound("confirm");
      void reload();
    }
  }

  async function revoke(token: string) {
    await fetch(`/api/invites?token=${encodeURIComponent(token)}`, { method: "DELETE" });
    playSound("back");
    void reload();
  }

  function inviteUrl(token: string): string {
    return `${window.location.origin}/login?invite=${token}`;
  }

  return (
    <div>
      <GpSubHeader>{t("heading")}</GpSubHeader>
      <div className="settings-row">
        <div className="min-w-0">
          <div className="text-[16px] text-body">{t("openRegistration")}</div>
          <div className="mt-1 text-[12px] text-dim">
            {t("openRegistrationDesc")}
          </div>
        </div>
        <GpToggle on={registrationOpen} onChange={toggleRegistration} label={t("openRegistration")} />
      </div>
      <div className="settings-row">
        <div className="min-w-0">
          <div className="text-[16px] text-body">{t("createInviteLink")}</div>
          <div className="mt-1 text-[12px] text-dim">
            {t("createInviteDesc")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <GpDropdown
            value={role}
            width={150}
            options={[
              { value: "viewer", label: t("roleViewer") },
              { value: "editor", label: t("roleEditor") },
              { value: "admin", label: t("roleAdmin") },
            ]}
            onChange={setRole}
          />
          <GpButton primary onClick={createInvite}>{t("create")}</GpButton>
        </div>
      </div>

      {invites.map((inv) => (
        <div key={inv.token} className="settings-row">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dim">
              {inv.role}
            </span>
            <code className="min-w-0 truncate text-[13px] text-body">/login?invite={inv.token.slice(0, 12)}…</code>
            <span className="shrink-0 text-[12px] text-dim">{t("expiresOn", { date: inv.expires_at.slice(0, 10) })}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <GpButton
              onClick={() => {
                void navigator.clipboard?.writeText(inviteUrl(inv.token));
                setCopied(inv.token);
              }}
            >
              {copied === inv.token ? t("copied") : t("copyLink")}
            </GpButton>
            <GpButton onClick={() => revoke(inv.token)}>{t("revoke")}</GpButton>
          </div>
        </div>
      ))}
    </div>
  );
}
