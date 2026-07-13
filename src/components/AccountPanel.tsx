"use client";

// SteamOS account screen: profile card + View Profile, status dropdown,
// account details (change password), and Change Account (sign out).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpDropdown, GpRow, GpButton } from "@/components/bpm/primitives";

export interface AccountData {
  id: number;
  username: string;
  name: string;
  avatar_url: string | null;
  status: string;
}

export default function AccountPanel({ user }: { user: AccountData }) {
  const t = useTranslations("accountComps.panel");
  const STATUS_LABELS: Record<string, string> = {
    online: t("statusOnline"),
    away: t("statusAway"),
    invisible: t("statusInvisible"),
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
      setPwMsg(t("pwMismatch"));
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
        setPwMsg(t("pwChanged"));
        setCurrent("");
        setNext("");
        setConfirm("");
        playSound("confirm");
      } else {
        setPwMsg(t("pwError", { error: data.error ?? t("failed") }));
      }
    } finally {
      setBusy(false);
    }
  }

  async function changeAccount() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const row = "flex items-center justify-between gap-6 rounded-[3px] bg-[#22262c] px-6 py-5";

  return (
    <div className="gamepadpagedsettings_ContentTransition_gh mx-auto flex max-w-[1200px] flex-col gap-2.5">
      {/* Profile card */}
      <div className={`gamepaddialog_Field_gh ${row}`}>
        <div className="flex items-center gap-5">
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar_url}
              alt=""
              className="steamavatar_avatarHolder_gh h-24 w-24 rounded-[3px] object-cover ring-1 ring-accent/60"
            />
          ) : (
            <span className="flex h-24 w-24 items-center justify-center rounded-[3px] bg-accent/20 text-4xl font-black text-accent ring-1 ring-accent/60">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <div className="personanameandstatus_playerName_gh text-2xl font-semibold text-bright">{user.name}</div>
            <div className={`text-[15px] ${status === "online" ? "text-[#57cbde]" : "text-dim"}`}>
              {STATUS_LABELS[status] ?? t("statusOnline")}
            </div>
          </div>
        </div>
        <div className="gamepaddialog_FieldChildren_gh flex items-center gap-2">
          {/* real <button>s — Steam's .DialogButton:enabled rules skip <a> */}
          <GpButton onClick={() => router.push("/profile")} className="px-6 py-3 text-[15px]">
            {t("viewProfile")}
          </GpButton>
          <GpButton primary onClick={() => router.push("/profile/edit")} className="px-6 py-3 text-[15px]">
            {t("editProfile")}
          </GpButton>
        </div>
      </div>

      {/* Status */}
      <GpRow label={t("yourStatus")} description={t("yourStatusDesc")}>
        <GpDropdown
          value={status}
          width={224}
          onChange={(v) => changeStatus(v)}
          options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }))}
        />
      </GpRow>

      {/* Account details / change password */}
      <div className="gamepaddialog_Field_gh rounded-[3px] bg-[#22262c] px-6 py-5">
        <button
          onClick={() => setShowPassword((s) => !s)}
          className="flex w-full cursor-pointer items-center justify-between gap-6 text-left"
        >
          <div>
            <div className="gamepaddialog_FieldLabel_gh text-[17px] text-bright">{t("accountDetails")}</div>
            <div className="gamepaddialog_FieldDescription_gh mt-0.5 text-sm text-dim">{t("accountDetailsDesc")}</div>
          </div>
          <span className={`text-dim transition-transform ${showPassword ? "rotate-90" : ""}`}>›</span>
        </button>
        {showPassword && (
          <div className="mt-5 flex max-w-md flex-col gap-3 border-t border-white/10 pt-5">
            <input
              type="password"
              className="input-dark px-3 py-2.5 text-sm"
              placeholder={t("currentPassword")}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
            <input
              type="password"
              className="input-dark px-3 py-2.5 text-sm"
              placeholder={t("newPassword")}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
            <input
              type="password"
              className="input-dark px-3 py-2.5 text-sm"
              placeholder={t("confirmPassword")}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            <div className="flex items-center gap-3">
              <GpButton
                primary
                onClick={changePassword}
                disabled={busy || !current || !next}
                className="w-fit text-sm"
              >
                {t("changePassword")}
              </GpButton>
              {pwMsg && <span className="text-sm text-accent">{pwMsg}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Account row */}
      <GpRow label={<>{t("accountLabel")} <span className="font-semibold">{user.username}</span></>}>
        <GpButton onClick={changeAccount} className="text-[15px]">
          {t("changeAccount")}
        </GpButton>
      </GpRow>
    </div>
  );
}
