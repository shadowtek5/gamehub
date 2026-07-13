"use client";

// Settings → Users, on the Steam settings pattern: a user row per account
// (avatar, name, meta) with an inline role dropdown that saves on change,
// plus an "Add user" row and a per-user "Manage" modal (reset password /
// delete). Same /api/users endpoints as before.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUserRow } from "@/lib/db";
import { playSound } from "@/lib/sounds";
import { useTranslations } from "next-intl";
import { GpSubHeader, GpButton, GpModal, GpDropdown } from "./primitives";

export default function SettingsUsers({
  initialUsers,
  currentUserId,
  profiles = [],
}: {
  initialUsers: AdminUserRow[];
  currentUserId: number;
  /** Restriction profiles (from Settings → Age Restrictions) to assign. */
  profiles?: { id: number; name: string }[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [manageId, setManageId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [resetPass, setResetPass] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const t = useTranslations("settingsUsersAge.users");

  const ROLES = [
    { value: "viewer", label: t("roleViewer") },
    { value: "editor", label: t("roleEditor") },
    { value: "admin", label: t("roleAdmin") },
  ];

  async function addUser() {
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newName, password: newPass, role: newRole }),
      });
      const data = await res.json();
      if (res.ok) {
        playSound("confirm");
        setNewName("");
        setNewPass("");
        setNewRole("viewer");
        setAddOpen(false);
        router.refresh();
      } else setMsg(data.error ?? t("failedCreate"));
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      playSound(res.ok ? "confirm" : "bumperEnd");
      if (!res.ok) setMsg(data.error ?? t("failed"));
      else router.refresh();
      return res.ok;
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(id: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        playSound("back");
        setManageId(null);
        setDeleteArmed(false);
        router.refresh();
      } else {
        const data = await res.json();
        setMsg(data.error ?? t("failedDelete"));
      }
    } finally {
      setBusy(false);
    }
  }

  const manageUser = initialUsers.find((u) => u.id === manageId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <GpSubHeader>{t("heading")}</GpSubHeader>
        <p className="mb-2 px-1 text-[13px] leading-relaxed text-dim">
          {t("description")}
        </p>

        {initialUsers.map((u) => {
          const self = u.id === currentUserId;
          const name = u.display_name?.trim() || u.username;
          const hours = Math.floor(u.playtime_seconds / 3600);
          const role = u.role ?? (u.is_admin === 1 ? "admin" : "viewer");
          return (
            <div key={u.id} className="settings-row">
              <div className="flex min-w-0 items-center gap-3">
                {u.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatar_url} alt="" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded bg-accent/25 text-base font-black text-accent">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[16px] text-body">{name}</span>
                    {self && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dim">
                        {t("you")}
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-dim">
                    @{u.username} · {t("joined")} {u.created_at.slice(0, 10)}
                    {hours > 0 && ` · ${t("hoursPlayed", { hours })}`}
                    {u.restriction_profile_name && (
                      <span className="text-[#e2a53c]"> · 🔒 {u.restriction_profile_name}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {self ? (
                  <span className="text-[13px] font-semibold text-dim">
                    {ROLES.find((r) => r.value === role)?.label}
                  </span>
                ) : (
                  <GpDropdown
                    value={role}
                    width={150}
                    options={ROLES}
                    onChange={(v) => patch(u.id, { role: v })}
                  />
                )}
                <GpButton onClick={() => { setManageId(u.id); setResetPass(""); setDeleteArmed(false); }}>
                  {t("manage")}
                </GpButton>
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <GpSubHeader>{t("addUser")}</GpSubHeader>
        <div className="settings-row">
          <div className="min-w-0">
            <div className="text-[16px] text-body">{t("createAccount")}</div>
            <div className="mt-1 text-[12px] text-dim">{t("addSomeone")}</div>
          </div>
          <GpButton primary onClick={() => { setNewName(""); setNewPass(""); setNewRole("viewer"); setMsg(""); setAddOpen(true); }}>
            {t("addUser")}
          </GpButton>
        </div>
      </div>

      {/* Add-user modal */}
      {addOpen && (
        <GpModal
          title={t("addUser")}
          width={520}
          onClose={() => setAddOpen(false)}
          footer={
            <>
              <GpButton onClick={() => setAddOpen(false)}>{t("cancel")}</GpButton>
              <GpButton primary onClick={addUser} disabled={busy || !newName.trim() || newPass.length < 6}>
                {t("create")}
              </GpButton>
            </>
          }
        >
          <div className="flex flex-col gap-4 py-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold uppercase tracking-[0.5px] text-dim">{t("username")}</span>
              <input className="input-dark rounded-[2px] px-3 py-2 text-[15px]" value={newName} onChange={(e) => setNewName(e.target.value)} autoComplete="off" data-form-type="other" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold uppercase tracking-[0.5px] text-dim">{t("password")}</span>
              <input type="password" className="input-dark rounded-[2px] px-3 py-2 text-[15px]" value={newPass} onChange={(e) => setNewPass(e.target.value)} autoComplete="new-password" data-form-type="other" />
            </label>
            <div className="flex items-center justify-between">
              <span className="text-[15px] text-body">{t("role")}</span>
              <GpDropdown value={newRole} width={180} options={ROLES} onChange={setNewRole} />
            </div>
            {msg && <div className="text-[13px] text-danger">{msg}</div>}
          </div>
        </GpModal>
      )}

      {/* Manage-user modal */}
      {manageUser && (
        <GpModal
          title={t("manageUser", { name: manageUser.display_name?.trim() || manageUser.username })}
          width={520}
          onClose={() => setManageId(null)}
          footer={<GpButton onClick={() => setManageId(null)}>{t("done")}</GpButton>}
        >
          <div className="flex flex-col gap-5 py-2">
            <div>
              <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.5px] text-dim">{t("resetPassword")}</div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  className="input-dark flex-1 rounded-[2px] px-3 py-2 text-[15px]"
                  placeholder={t("newPasswordPlaceholder")}
                  value={resetPass}
                  onChange={(e) => setResetPass(e.target.value)}
                  autoComplete="new-password"
                  data-form-type="other"
                />
                <GpButton
                  primary
                  disabled={busy || resetPass.length < 6}
                  onClick={async () => {
                    if (await patch(manageUser.id, { password: resetPass })) setResetPass("");
                  }}
                >
                  {t("set")}
                </GpButton>
              </div>
              <div className="mt-1 text-[12px] text-dim">{t("signsOut")}</div>
            </div>

            <div className="border-t-2 border-black/40 pt-4">
              <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.5px] text-dim">
                {t("ageRestriction")}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-[13px] text-dim">
                  {profiles.length === 0 ? (
                    <>
                      {t("noProfilesCreateIn")}{" "}
                      <span className="text-body">{t("settingsAgeRestrictionsPath")}</span>.
                    </>
                  ) : (
                    t("assignProfile")
                  )}
                </div>
                <GpDropdown
                  value={String(manageUser.restriction_profile_id ?? "")}
                  width={200}
                  options={[
                    { value: "", label: t("noRestriction") },
                    ...profiles.map((p) => ({ value: String(p.id), label: p.name })),
                  ]}
                  onChange={(v) =>
                    patch(manageUser.id, { restrictionProfileId: v === "" ? null : Number(v) })
                  }
                />
              </div>
            </div>

            {manageUser.id !== currentUserId && (
              <div className="border-t-2 border-black/40 pt-4">
                <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.5px] text-danger">{t("dangerZone")}</div>
                {deleteArmed ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => removeUser(manageUser.id)}
                      disabled={busy}
                      className="cursor-pointer rounded-[2px] bg-[#a33a3a] px-4 py-2 text-[15px] font-semibold text-white hover:bg-[#c04545] disabled:opacity-50"
                    >
                      {t("deleteConfirm", { username: manageUser.username })}
                    </button>
                    <GpButton onClick={() => setDeleteArmed(false)}>{t("cancel")}</GpButton>
                  </div>
                ) : (
                  <GpButton onClick={() => { playSound("modalOpen"); setDeleteArmed(true); }}>
                    {t("deleteUser")}
                  </GpButton>
                )}
              </div>
            )}
            {msg && <div className="text-[13px] text-danger">{msg}</div>}
          </div>
        </GpModal>
      )}
    </div>
  );
}
