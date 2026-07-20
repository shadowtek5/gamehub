"use client";

// Mobile account panel — phone-native version of the desktop AccountPanel.
// Same APIs (profile status, password change, sign out), laid out as clean
// stacked cards with native controls instead of the Big Picture chrome.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpDropdown } from "@/components/bpm/primitives";

export interface AccountData {
  id: number;
  username: string;
  name: string;
  avatar_url: string | null;
  status: string;
}

const CARD = "rounded-[12px] bg-[#1a1f27] ring-1 ring-white/5";

export default function MobileAccount({ user }: { user: AccountData }) {
  const t = useTranslations("mobileAccount");
  // Reuse the stats page's own translated title for the link row.
  const tStats = useTranslations("stats");
  const STATUS_LABELS: Record<string, string> = {
    online: t("account.statusOnline"),
    away: t("account.statusAway"),
    invisible: t("account.statusInvisible"),
  };
  const [status, setStatus] = useState(user.status);
  const [showPassword, setShowPassword] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function changeStatus(value: string) {
    setStatus(value);
    playSound("activate");
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: value }),
    });
    router.refresh();
  }

  async function changePassword() {
    if (next !== confirm) {
      setPwMsg(`✗ ${t("account.passwordsDontMatch")}`);
      return;
    }
    setBusy(true);
    setPwMsg("");
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = await res.json();
      if (res.ok) {
        setPwMsg(`✓ ${t("account.passwordChanged")}`);
        setCurrent("");
        setNext("");
        setConfirm("");
        playSound("confirm");
      } else {
        setPwMsg(`✗ ${data.error ?? t("common.failed")}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Profile header */}
      <div className={`${CARD} flex items-center gap-4 p-4`}>
        {user.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url}
            alt=""
            className="h-16 w-16 shrink-0 rounded-[10px] object-cover ring-1 ring-accent/50"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[10px] bg-accent/20 text-2xl font-black text-accent ring-1 ring-accent/50">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[18px] font-black text-bright">{user.name}</div>
          <div className={`text-[13px] ${status === "online" ? "text-[#57cbde]" : "text-dim"}`}>
            {STATUS_LABELS[status] ?? t("account.statusOnline")}
          </div>
          <div className="truncate text-[12px] text-dim">@{user.username}</div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <Link
            href={`/mobile/profile/${user.id}`}
            className="rounded-[8px] bg-[#232a34] px-3 py-1.5 text-center text-[12px] font-semibold text-body active:bg-[#2c3540]"
          >
            {t("account.view")}
          </Link>
          <Link
            href="/mobile/profile/edit"
            className="rounded-[8px] bg-[#232a34] px-3 py-1.5 text-center text-[12px] font-semibold text-body active:bg-[#2c3540]"
          >
            {t("account.edit")}
          </Link>
        </div>
      </div>

      {/* Your stats — playtime, activity heatmap, most played, backlog */}
      <Link href="/mobile/stats" className={`${CARD} flex items-center gap-3 p-4 active:bg-[#2c3540]`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-dim">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
        <span className="flex-1 text-[14px] font-semibold text-bright">{tStats("title")}</span>
        <span className="text-dim">›</span>
      </Link>

      {/* Status */}
      <div className={`${CARD} p-4`}>
        <div className="mb-2 text-[13px] font-semibold text-body">{t("account.yourStatus")}</div>
        <p className="mb-2 mt-0.5 text-[12px] text-dim">{t("account.statusDescription")}</p>
        <GpDropdown
          value={status}
          width="100%"
          onChange={changeStatus}
          options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }))}
        />
      </div>

      {/* Change password (collapsible) */}
      <div className={CARD}>
        <button
          onClick={() => setShowPassword((s) => !s)}
          className="flex w-full items-center justify-between gap-4 p-4 text-left active:bg-white/5"
        >
          <div>
            <div className="text-[15px] font-semibold text-bright">{t("account.accountDetails")}</div>
            <div className="mt-0.5 text-[12px] text-dim">{t("account.changeYourPassword")}</div>
          </div>
          <span className={`text-dim transition-transform ${showPassword ? "rotate-90" : ""}`}>›</span>
        </button>
        {showPassword && (
          <div className="flex flex-col gap-2.5 border-t border-white/10 p-4">
            <input
              type="password"
              className="w-full rounded-[8px] bg-[#12161c] px-3 py-2.5 text-[15px] text-body ring-1 ring-white/10"
              placeholder={t("account.currentPassword")}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
            <input
              type="password"
              className="w-full rounded-[8px] bg-[#12161c] px-3 py-2.5 text-[15px] text-body ring-1 ring-white/10"
              placeholder={t("account.newPassword")}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
            <input
              type="password"
              className="w-full rounded-[8px] bg-[#12161c] px-3 py-2.5 text-[15px] text-body ring-1 ring-white/10"
              placeholder={t("account.confirmNewPassword")}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            <button
              onClick={changePassword}
              disabled={busy || !current || !next}
              className="mt-1 w-full rounded-[8px] bg-accent py-2.5 text-[15px] font-semibold text-black disabled:opacity-40"
            >
              {busy ? t("account.saving") : t("account.changePassword")}
            </button>
            {pwMsg && <span className="text-[13px] text-accent">{pwMsg}</span>}
          </div>
        )}
      </div>

      {/* Sign out */}
      <div className={`${CARD} flex items-center justify-between gap-4 p-4`}>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-bright">{t("account.signedIn")}</div>
          <div className="truncate text-[12px] text-dim">@{user.username}</div>
        </div>
        <button
          onClick={signOut}
          className="shrink-0 rounded-[8px] bg-[#232a34] px-4 py-2 text-[14px] font-semibold text-body active:bg-[#2c3540]"
        >
          {t("account.signOut")}
        </button>
      </div>
    </div>
  );
}
