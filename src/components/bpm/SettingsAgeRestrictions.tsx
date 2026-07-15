"use client";

// Settings → Age Restrictions. Create named content-restriction profiles
// (allowed systems + a maximum rating), then assign them to users in Settings →
// Users. Enforced server-side across every browse surface.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RestrictionProfile } from "@/lib/db";
import { RATING_CAPS, capToMax, maxToCap } from "@/lib/ageRating";
import { playSound } from "@/lib/sounds";
import { useTranslations } from "next-intl";
import { GpSubHeader, GpButton, GpModal, GpDropdown, GpCheck } from "./primitives";

// 0-23 → "8 AM" / "8 PM" for the allowed-hours pickers.
function formatHour(h: number): string {
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${am ? "AM" : "PM"}`;
}
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: formatHour(h) }));

function parseAllowed(json: string | null): string[] | null {
  if (!json) return null;
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

/** One-line summary of what a profile allows, for the list rows. */
function summarize(p: RestrictionProfile, systemsTotal: number): string {
  const allowed = parseAllowed(p.allowed_systems);
  const sys = allowed === null ? "All systems" : `${allowed.length} of ${systemsTotal} systems`;
  const cap = RATING_CAPS.find((c) => c.max === p.max_rating);
  const rating = p.max_rating == null ? "no rating limit" : (cap?.label ?? `≤ ${p.max_rating}`);
  return `${sys} · ${rating}${p.hide_unrated ? " · unrated hidden" : ""}`;
}

export default function SettingsAgeRestrictions({
  initialProfiles,
  systems,
}: {
  initialProfiles: RestrictionProfile[];
  systems: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const t = useTranslations("settingsUsersAge.age");
  const [editing, setEditing] = useState<RestrictionProfile | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Editor state
  const [name, setName] = useState("");
  const [systemMode, setSystemMode] = useState<"all" | "choose">("all");
  const [allowed, setAllowed] = useState<string[]>([]);
  const [capValue, setCapValue] = useState("none");
  const [hideUnrated, setHideUnrated] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(""); // minutes, "" = no limit
  const [scheduleOn, setScheduleOn] = useState(false);
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(20);
  const [deleteArmed, setDeleteArmed] = useState(false);

  function openEditor(p: RestrictionProfile | "new") {
    playSound("modalOpen");
    setMsg("");
    setDeleteArmed(false);
    if (p === "new") {
      setName("");
      setSystemMode("all");
      setAllowed([]);
      setCapValue("none");
      setHideUnrated(false);
      setDailyLimit("");
      setScheduleOn(false);
      setStartHour(8);
      setEndHour(20);
    } else {
      const parsed = parseAllowed(p.allowed_systems);
      setName(p.name);
      setSystemMode(parsed ? "choose" : "all");
      setAllowed(parsed ?? []);
      setCapValue(maxToCap(p.max_rating));
      setHideUnrated(!!p.hide_unrated);
      setDailyLimit(p.daily_limit_minutes != null ? String(p.daily_limit_minutes) : "");
      const sched = p.allowed_start_hour != null && p.allowed_end_hour != null;
      setScheduleOn(sched);
      setStartHour(sched ? p.allowed_start_hour! : 8);
      setEndHour(sched ? p.allowed_end_hour! : 20);
    }
    setEditing(p);
  }

  async function save() {
    if (!name.trim()) {
      setMsg(t("giveNameError"));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        allowedSystems: systemMode === "choose" ? allowed : null,
        maxRating: capToMax(capValue),
        hideUnrated,
        dailyLimitMinutes: dailyLimit.trim() ? Number(dailyLimit) : null,
        allowedStartHour: scheduleOn ? startHour : null,
        allowedEndHour: scheduleOn ? endHour : null,
      };
      const isNew = editing === "new";
      const url = isNew ? "/api/restriction-profiles" : `/api/restriction-profiles/${(editing as RestrictionProfile).id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        playSound("confirm");
        setEditing(null);
        router.refresh();
      } else {
        setMsg((await res.json().catch(() => ({}))).error ?? t("failedSave"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/restriction-profiles/${id}`, { method: "DELETE" });
      if (res.ok) {
        playSound("back");
        setEditing(null);
        router.refresh();
      } else {
        setMsg((await res.json().catch(() => ({}))).error ?? t("failedDelete"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <GpSubHeader>{t("heading")}</GpSubHeader>
        <p className="mb-3 px-1 text-[13px] leading-relaxed text-dim">
          {t("description")}
        </p>

        {initialProfiles.length === 0 ? (
          <div className="settings-row">
            <div className="min-w-0">
              <div className="text-[16px] text-body">{t("noProfiles")}</div>
              <div className="mt-1 text-[12px] text-dim">
                {t("createOneHint")}
              </div>
            </div>
          </div>
        ) : (
          initialProfiles.map((p) => (
            <div key={p.id} className="settings-row">
              <div className="min-w-0">
                <div className="truncate text-[16px] text-body">{p.name}</div>
                <div className="mt-0.5 text-[12px] text-dim">
                  {summarize(p, systems.length)}
                  {p.assigned ? ` · ${t("assignedUsers", { count: p.assigned })}` : ""}
                </div>
              </div>
              <GpButton onClick={() => openEditor(p)}>{t("edit")}</GpButton>
            </div>
          ))
        )}

        <div className="mt-3 flex justify-end">
          <GpButton primary onClick={() => openEditor("new")}>
            {t("createProfile")}
          </GpButton>
        </div>
      </div>

      {editing && (
        <GpModal
          title={editing === "new" ? t("newProfile") : t("editProfile", { name: (editing as RestrictionProfile).name })}
          width={560}
          onClose={() => setEditing(null)}
          footer={
            <>
              <GpButton onClick={() => setEditing(null)}>{t("cancel")}</GpButton>
              <GpButton primary onClick={save} disabled={busy || !name.trim()}>
                {t("saveProfile")}
              </GpButton>
            </>
          }
        >
          <div className="flex flex-col gap-5 py-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold uppercase tracking-[0.5px] text-dim">{t("name")}</span>
              <input
                className="input-dark rounded-[2px] px-3 py-2 text-[15px]"
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                data-form-type="other"
              />
            </label>

            {/* Allowed systems */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[14px] text-body">{t("allowedSystems")}</span>
                <div className="inline-flex rounded-[3px] bg-black/30 p-0.5 ring-1 ring-white/10">
                  {(["all", "choose"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setSystemMode(m)}
                      className={`cursor-pointer rounded-[2px] px-3 py-1 text-[12px] font-semibold transition-colors ${
                        systemMode === m ? "bg-accent/25 text-bright" : "text-dim hover:text-body"
                      }`}
                    >
                      {m === "all" ? t("all") : t("choose")}
                    </button>
                  ))}
                </div>
              </div>
              {systemMode === "choose" && (
                <>
                  <div className="mb-2 flex items-center gap-2 text-[12px]">
                    <button
                      onClick={() => setAllowed(systems.map((s) => s.slug))}
                      className="cursor-pointer text-accent hover:underline"
                    >
                      {t("selectAll")}
                    </button>
                    <span className="text-dim">·</span>
                    <button
                      onClick={() => setAllowed([])}
                      className="cursor-pointer text-accent hover:underline"
                    >
                      {t("clear")}
                    </button>
                    <span className="ml-auto text-dim">
                      {t("countOfTotal", { count: allowed.length, total: systems.length })}
                    </span>
                  </div>
                  <div className="flex max-h-[200px] flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {systems.map((s) => {
                      const on = allowed.includes(s.slug);
                      return (
                        <button
                          key={s.slug}
                          onClick={() =>
                            setAllowed((a) => (on ? a.filter((x) => x !== s.slug) : [...a, s.slug]))
                          }
                          className={`cursor-pointer truncate rounded-full px-3 py-1 text-[12px] ring-1 transition-colors ${
                            on
                              ? "bg-accent/20 text-bright ring-accent/50"
                              : "bg-black/25 text-dim ring-white/10 hover:text-body"
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                    {systems.length === 0 && (
                      <div className="text-[12px] text-dim">{t("noSystems")}</div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Maximum rating */}
            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] text-body">{t("maximumRating")}</span>
                <GpDropdown
                  value={capValue}
                  width={200}
                  options={RATING_CAPS.map((c) => ({ value: c.value, label: c.label }))}
                  onChange={setCapValue}
                />
              </div>
              {capValue !== "none" && (
                <div className="mt-2">
                  <GpCheck checked={hideUnrated} onChange={setHideUnrated} label={t("hideUnratedLabel")} />
                </div>
              )}
            </div>

            {/* Playtime limits & allowed-hours schedule */}
            <div className="border-t-2 border-black/40 pt-4">
              <div className="mb-3 text-[14px] font-semibold text-body">{t("playTimeHeading")}</div>
              <label className="flex flex-wrap items-center gap-3">
                <span className="text-[14px] text-body">{t("dailyLimitLabel")}</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  placeholder={t("noLimit")}
                  className="w-28 rounded-[3px] bg-[#12161c] px-3 py-2 text-[14px] text-bright outline-none ring-1 ring-white/10 placeholder:text-dim focus:ring-2 focus:ring-white"
                />
                <span className="text-[13px] text-dim">{t("minutesPerDay")}</span>
              </label>
              <div className="mt-3">
                <GpCheck checked={scheduleOn} onChange={setScheduleOn} label={t("scheduleLabel")} />
                {scheduleOn && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-1">
                    <span className="text-[13px] text-dim">{t("allowedFrom")}</span>
                    <GpDropdown
                      value={String(startHour)}
                      width={110}
                      options={HOUR_OPTIONS}
                      onChange={(v) => setStartHour(Number(v))}
                    />
                    <span className="text-[13px] text-dim">{t("allowedTo")}</span>
                    <GpDropdown
                      value={String(endHour)}
                      width={110}
                      options={HOUR_OPTIONS}
                      onChange={(v) => setEndHour(Number(v))}
                    />
                  </div>
                )}
              </div>
            </div>

            {editing !== "new" && (
              <div className="border-t-2 border-black/40 pt-4">
                {deleteArmed ? (
                  <div className="flex flex-col gap-2">
                    <div className="text-[12px] text-[#e2a53c]">
                      {(() => {
                        const n = (editing as RestrictionProfile).assigned ?? 0;
                        return n > 0
                          ? t("deleteWarning", { count: n })
                          : t("noUsersAssigned");
                      })()}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => remove((editing as RestrictionProfile).id)}
                        disabled={busy}
                        className="cursor-pointer rounded-[2px] bg-[#a33a3a] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#c04545] disabled:opacity-50"
                      >
                        {t("deleteProfile")}
                      </button>
                      <GpButton onClick={() => setDeleteArmed(false)}>{t("cancel")}</GpButton>
                    </div>
                  </div>
                ) : (
                  <GpButton onClick={() => { playSound("modalOpen"); setDeleteArmed(true); }}>
                    {t("deleteProfile")}
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
