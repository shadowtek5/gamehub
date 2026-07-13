"use client";

// Set-integrity tools — the "am I missing anything / is anything wrong" panel.
// Runs against the local DAT hash DB: classify every hashed ROM
// (verified / bad-or-hack / unknown), find byte-identical duplicates, and show
// how complete each system is versus its full No-Intro/Redump set. Read-only —
// nothing here ever touches ROM files on disk.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { AuditJobStatus, DuplicateGroup, SetReport, TitleDupGroup } from "@/lib/audit";
import type { HashJobStatus } from "@/lib/hashJob";
import { playSound } from "@/lib/sounds";
import { GpSubHeader, GpButton, GpProgress, GpDropdown } from "./primitives";

interface Counts {
  verified: number;
  mismatch: number;
  unknown: number;
  unchecked: number;
}
interface Overview {
  datConfigured: boolean;
  coveredSystems: { slug: string; name: string }[];
  counts: Counts;
  job: AuditJobStatus;
}
interface DupMember {
  id: number;
  title: string;
  platform_name: string;
  path: string;
  size_bytes: number;
}
interface DupGroup extends Omit<DuplicateGroup, "members"> {
  members: DupMember[];
}
interface SetRow extends SetReport {
  name: string;
}

function fmtBytes(n: number): string {
  if (n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex min-w-[92px] flex-col rounded-[3px] bg-[#23262e] px-4 py-3">
      <span className={`text-[22px] font-bold leading-none ${tone}`}>{value.toLocaleString()}</span>
      <span className="mt-1 text-[12px] text-dim">{label}</span>
    </div>
  );
}

export default function SetIntegrity() {
  const t = useTranslations("setIntegrity");
  const [ov, setOv] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<"" | "audit" | "hash">("");
  const [msg, setMsg] = useState("");
  const [audit, setAudit] = useState<AuditJobStatus | null>(null);
  const [hash, setHash] = useState<HashJobStatus | null>(null);

  const [dups, setDups] = useState<{ groups: DupGroup[]; totalWasted: number } | null>(null);
  // 1G1R: same game, multiple region/revision dumps. `keepSel` maps a group key
  // to the copy the user chose to keep (defaults to the server's suggestion).
  const [tdups, setTdups] = useState<{ groups: TitleDupGroup[]; redundant: number } | null>(null);
  const [keepSel, setKeepSel] = useState<Record<string, number>>({});
  const [sets, setSets] = useState<SetRow[] | null>(null);
  // Preferred region for set-completeness, remembered across visits. Defaults to
  // North America; falls back per system where NA has no releases (e.g. Famicom).
  const [setRegion, setSetRegion] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("gh-set-region")) || "USA"
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const hashPoll = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auditPoll = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pollAudit() {
    auditPoll.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/audit", { cache: "no-store" });
        const data: Overview = await res.json();
        setOv(data);
        setAudit(data.job ?? null);
        if (data.job?.running) pollAudit();
        else setBusy("");
      } catch {
        setBusy("");
      }
    }, 1000);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/audit", { cache: "no-store" });
        const data: Overview = await res.json();
        if (cancelled) return;
        setOv(data);
        setAudit(data.job ?? null);
        // An audit started elsewhere (or before a navigation) is still running.
        if (data.job?.running) {
          setBusy("audit");
          pollAudit();
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      if (hashPoll.current) clearTimeout(hashPoll.current);
      if (auditPoll.current) clearTimeout(auditPoll.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAudit() {
    playSound("activate");
    setMsg("");
    const res = await fetch("/api/audit", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? t("auditFailed"));
      return;
    }
    setBusy("audit");
    setAudit(data.job ?? null);
    pollAudit();
  }

  function pollHash() {
    hashPoll.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/hash/job", { cache: "no-store" });
        const s: HashJobStatus = await res.json();
        setHash(s);
        if (s.running) pollHash();
        else {
          setBusy("");
          setMsg(t("rehashComplete"));
        }
      } catch {
        setBusy("");
      }
    }, 1500);
  }

  async function rehashArchives() {
    playSound("activate");
    setBusy("hash");
    setMsg("");
    const res = await fetch("/api/hash/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rehashArchives: true }),
    });
    if (!res.ok && res.status !== 409) {
      setBusy("");
      setMsg(t("couldNotStartHashing"));
      return;
    }
    setHash(await res.json());
    pollHash();
  }

  async function loadDuplicates() {
    playSound("activate");
    if (dups) return setDups(null); // toggle off
    const res = await fetch("/api/audit/duplicates", { cache: "no-store" });
    setDups(await res.json());
  }

  const groupKey = (g: TitleDupGroup) => `${g.slug}|${g.titleNorm}`;

  async function loadTitleDuplicates() {
    playSound("activate");
    if (tdups) return setTdups(null); // toggle off
    const res = await fetch("/api/audit/title-duplicates", { cache: "no-store" });
    const data = (await res.json()) as { groups: TitleDupGroup[]; redundant: number };
    setTdups(data);
    // Pre-select the server's suggested keeper for every group.
    const sel: Record<string, number> = {};
    for (const g of data.groups ?? []) sel[groupKey(g)] = g.suggestedKeepId;
    setKeepSel(sel);
  }

  /** Hide every copy in a group except the chosen keeper (reversible). */
  async function hideExtras(groups: TitleDupGroup[]) {
    const hideIds: number[] = [];
    for (const g of groups) {
      const keepId = keepSel[groupKey(g)] ?? g.suggestedKeepId;
      for (const m of g.members) if (m.id !== keepId) hideIds.push(m.id);
    }
    if (!hideIds.length) return;
    playSound("activate");
    const res = await fetch("/api/audit/dedupe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hideIds }),
    });
    if (!res.ok) {
      setMsg(t("couldNotHide"));
      return;
    }
    const done = new Set(groups.map(groupKey));
    setTdups((cur) =>
      cur
        ? { groups: cur.groups.filter((x) => !done.has(groupKey(x))), redundant: cur.redundant - hideIds.length }
        : cur
    );
    setMsg(t("hidExtras", { count: hideIds.length }));
  }

  const fetchSets = useCallback(async (region: string) => {
    const res = await fetch(`/api/audit/sets?region=${encodeURIComponent(region)}`, {
      cache: "no-store",
    });
    const data = await res.json();
    setSets(data.reports ?? []);
  }, []);

  async function loadSets() {
    playSound("activate");
    if (sets) return setSets(null);
    await fetchSets(setRegion);
  }

  async function changeRegion(region: string) {
    setSetRegion(region);
    if (typeof window !== "undefined") localStorage.setItem("gh-set-region", region);
    setSets(null);
    await fetchSets(region);
  }

  if (!ov) return null;

  if (!ov.datConfigured) {
    return (
      <div>
        <GpSubHeader>{t("title")}</GpSubHeader>
        <p className="px-1 text-[13px] leading-relaxed text-dim">
          {t("datNotConfigured")}
        </p>
      </div>
    );
  }

  const hashPct = hash && hash.total > 0 ? Math.round((hash.done / hash.total) * 100) : 0;

  return (
    <div>
      <GpSubHeader>{t("title")}</GpSubHeader>
      <p className="mb-3 px-1 text-[13px] leading-relaxed text-dim">
        {t("introLead")} <span className="text-body">{t("verified")}</span>{" "}
        {t("introVerifiedDesc")} <span className="text-body">{t("badHack")}</span>{" "}
        {t("introBadHackDesc")} <span className="text-body">{t("unknown")}</span>{" "}
        {t("introUnknownDesc")}
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <Stat label={t("verified")} value={ov.counts.verified} tone="text-[#6dc85f]" />
        <Stat label={t("badHack")} value={ov.counts.mismatch} tone="text-[#e2a53c]" />
        <Stat label={t("unknown")} value={ov.counts.unknown} tone="text-dim" />
        <Stat label={t("unchecked")} value={ov.counts.unchecked} tone="text-dim" />
      </div>

      <div className="settings-row">
        <div className="min-w-0">
          <div className="text-[16px] text-body">{t("auditTitle")}</div>
          <div className="mt-1 text-[12px] text-dim">
            {t("auditDesc", { count: ov.coveredSystems.length })}
          </div>
        </div>
        <GpButton primary onClick={runAudit} disabled={busy !== ""}>
          {busy === "audit" ? t("auditing") : t("runAudit")}
        </GpButton>
      </div>

      {busy === "audit" && audit && (
        <div className="mb-2 rounded-[3px] bg-[#23262e] p-4">
          <div className="mb-2 text-[13px] text-body">
            {t("auditingProgress", {
              done: audit.done.toLocaleString(),
              total: audit.total.toLocaleString(),
            })}
          </div>
          <GpProgress value={audit.total > 0 ? Math.round((audit.done / audit.total) * 100) : 0} />
        </div>
      )}

      {audit && !audit.running && busy !== "audit" && (
        <div className="mb-2 rounded-[3px] bg-[#23262e] px-4 py-3 text-[13px] text-body">
          {t("auditSummary", {
            checked: (audit.verified + audit.mismatch + audit.unknown).toLocaleString(),
            verified: audit.verified.toLocaleString(),
            mismatch: audit.mismatch.toLocaleString(),
            unknown: audit.unknown.toLocaleString(),
          })}
          {audit.unhashed > 0 && t("auditUnhashed", { count: audit.unhashed.toLocaleString() })}
          {audit.wrongSize > 0 && t("auditWrongSize", { count: audit.wrongSize.toLocaleString() })}
        </div>
      )}

      <div className="settings-row">
        <div className="min-w-0">
          <div className="text-[16px] text-body">{t("rehashTitle")}</div>
          <div className="mt-1 text-[12px] text-dim">
            {t("rehashLead")} <em>{t("rehashInner")}</em>{" "}
            {t("rehashTail")}
          </div>
        </div>
        <GpButton onClick={rehashArchives} disabled={busy !== ""}>
          {busy === "hash" ? t("hashing") : t("rehashArchives")}
        </GpButton>
      </div>

      {busy === "hash" && hash && (
        <div className="mb-2 rounded-[3px] bg-[#23262e] p-4">
          <div className="mb-2 text-[13px] text-body">
            {t("hashingProgress", {
              done: hash.done.toLocaleString(),
              total: hash.total.toLocaleString(),
            })}
            {hash.current ? ` — ${hash.current}` : ""}
          </div>
          <GpProgress value={hashPct} />
        </div>
      )}

      <div className="settings-row">
        <div className="min-w-0">
          <div className="text-[16px] text-body">{t("duplicatesTitle")}</div>
          <div className="mt-1 text-[12px] text-dim">
            {t("duplicatesDesc")}
          </div>
        </div>
        <GpButton onClick={loadDuplicates}>{dups ? t("hide") : t("findDuplicates")}</GpButton>
      </div>

      {dups && (
        <div className="mb-2 rounded-[3px] bg-[#23262e] p-4">
          {dups.groups.length === 0 ? (
            <div className="text-[13px] text-dim">{t("noDuplicates")}</div>
          ) : (
            <>
              <div className="mb-2 text-[13px] text-body">
                {t("duplicateGroups", {
                  count: dups.groups.length,
                  bytes: fmtBytes(dups.totalWasted),
                })}
              </div>
              <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto">
                {dups.groups.map((g) => (
                  <div key={g.md5} className="rounded-[3px] bg-black/25 p-3">
                    <div className="mb-1 text-[12px] text-dim">
                      {t("duplicateGroupDetail", {
                        count: g.count,
                        size: fmtBytes(g.members[0]?.size_bytes ?? 0),
                        md5: g.md5.slice(0, 12),
                      })}
                    </div>
                    {g.members.map((m) => (
                      <div key={m.id} className="truncate text-[12px] text-body" title={m.path}>
                        <span className="text-dim">[{m.platform_name}]</span> {m.path}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="settings-row">
        <div className="min-w-0">
          <div className="text-[16px] text-body">{t("titleDupTitle")}</div>
          <div className="mt-1 text-[12px] text-dim">
            {t("titleDupDesc")}
          </div>
        </div>
        <GpButton onClick={loadTitleDuplicates}>{tdups ? t("hide") : t("find")}</GpButton>
      </div>

      {tdups && (
        <div className="mb-2 rounded-[3px] bg-[#23262e] p-4">
          {tdups.groups.length === 0 ? (
            <div className="text-[13px] text-dim">{t("noTitleDups")}</div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[13px] text-body">
                  {t("titleDupCount", {
                    count: tdups.groups.length,
                    redundant: tdups.redundant.toLocaleString(),
                  })}
                </span>
                <GpButton onClick={() => hideExtras(tdups.groups)}>
                  {t("keepSelectedHideExtras")}
                </GpButton>
              </div>
              <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
                {tdups.groups.map((g) => {
                  const key = groupKey(g);
                  const keepId = keepSel[key] ?? g.suggestedKeepId;
                  return (
                    <div key={key} className="rounded-[3px] bg-black/25 p-3">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] text-body">
                          <span className="text-dim">[{g.platform_name}]</span> {g.displayTitle}
                          <span className="text-dim">{t("copiesCount", { count: g.count })}</span>
                        </span>
                        <GpButton onClick={() => hideExtras([g])}>
                          {t("hideExtras", { count: g.count - 1 })}
                        </GpButton>
                      </div>
                      <div className="flex flex-col gap-1">
                        {g.members.map((m) => (
                          <label
                            key={m.id}
                            className="flex cursor-pointer items-center gap-2 text-[12px] text-body"
                          >
                            <input
                              type="radio"
                              name={`keep-${key}`}
                              checked={keepId === m.id}
                              onChange={() => setKeepSel((s) => ({ ...s, [key]: m.id }))}
                            />
                            <span className="truncate" title={m.filename}>
                              {m.filename}
                              {m.region ? <span className="text-dim"> · {m.region}</span> : null}
                              {m.revision ? <span className="text-dim"> · {m.revision}</span> : null}
                              {m.scraped ? <span className="text-[#4c9fe0]"> · {t("scraped")}</span> : null}
                              {m.dat_status === "verified" ? (
                                <span className="text-[#6dc85f]"> · {t("verifiedTag")}</span>
                              ) : null}
                              <span className="text-dim"> · {fmtBytes(m.size_bytes)}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <div className="settings-row">
        <div className="min-w-0">
          <div className="text-[16px] text-body">{t("missingFromSetTitle")}</div>
          <div className="mt-1 text-[12px] text-dim">
            {t("missingFromSetDesc")}
          </div>
        </div>
        <GpButton onClick={loadSets}>{sets ? t("hide") : t("showReport")}</GpButton>
      </div>

      {sets && (
        <div className="mb-2 rounded-[3px] bg-[#23262e] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[13px] text-dim">{t("countTitlesForRegion")}</span>
            <GpDropdown
              value={setRegion}
              width={230}
              onChange={changeRegion}
              options={[
                { value: "USA", label: t("regionNorthAmerica"), description: t("regionNaDesc") },
                { value: "Europe", label: t("regionEurope"), description: t("regionEuDesc") },
                { value: "Japan", label: t("regionJapan"), description: t("regionJpDesc") },
                { value: "all", label: t("regionAll") },
              ]}
            />
          </div>
          {sets.length === 0 ? (
            <div className="text-[13px] text-dim">{t("noSystemsCoverage")}</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sets.map((r) => {
                const pct = r.datTotal > 0 ? Math.round((r.owned / r.datTotal) * 100) : 0;
                const open = expanded === r.slug;
                return (
                  <div key={r.slug} className="rounded-[3px] bg-black/25 p-3">
                    <button
                      className="Focusable flex w-full cursor-pointer items-center justify-between gap-3 text-left"
                      onClick={() => {
                        playSound("navigate");
                        setExpanded(open ? null : r.slug);
                      }}
                    >
                      <span className="min-w-0 truncate text-[14px] text-body">
                        {r.name}
                        {r.region && <span className="ml-2 text-[12px] text-dim">{r.region}</span>}
                      </span>
                      <span className="shrink-0 text-[12px] text-dim">
                        {r.owned.toLocaleString()} / {r.datTotal.toLocaleString()} ({pct}%) ·{" "}
                        <span className={r.missing > 0 ? "text-[#e2a53c]" : "text-[#6dc85f]"}>
                          {t("missingCount", { count: r.missing.toLocaleString() })}
                        </span>
                      </span>
                    </button>
                    <div className="mt-2">
                      <GpProgress value={pct} />
                    </div>
                    {open && r.missingSample.length > 0 && (
                      <div className="mt-2 max-h-[240px] overflow-y-auto">
                        {r.missingSample.map((n) => (
                          <div key={n} className="truncate text-[12px] text-dim">
                            {n}
                          </div>
                        ))}
                        {r.missing > r.missingSample.length && (
                          <div className="mt-1 text-[12px] text-dim">
                            {t("andMore", {
                              count: (r.missing - r.missingSample.length).toLocaleString(),
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {msg && <div className="px-1 text-[13px] text-dim">{msg}</div>}
    </div>
  );
}
