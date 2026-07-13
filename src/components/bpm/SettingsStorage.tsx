"use client";

import { GpSwitch } from "@/components/bpm/primitives";

// Settings → Storage, redesigned to Steam's Storage layout (reference:
// refs/steam-captures/storage.png): a location card, a path label, a
// segmented usage bar with a colored legend, then an "Systems N" item list.
// Steam segments a drive by content type + size; GameHub segments the
// library by system + game count. Rows expand to edit folders. Same
// endpoints as before (/api/settings/systems, /api/settings/library,
// /api/scan, /api/settings/systems/detect).

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PLATFORMS_SORTED, platformVendor } from "@/lib/platforms";
import type { DetectedFolder } from "@/lib/scanner";
import type { SystemFolderRow } from "@/lib/db";
import SystemIcon from "@/components/SystemIcon";
import FolderPicker from "@/components/FolderPicker";
import { playSound } from "@/lib/sounds";
import { GpSubHeader, GpButton, GpModal } from "./primitives";

interface MappingRow {
  platform_slug: string;
  path: string;
  variant: string;
}

interface ScrapeJob {
  running: boolean;
  total: number;
  done: number;
  current: string;
  systems: string[] | null;
}

export default function SettingsStorage({
  initialPaths,
  initialSystemFolders,
  gameCounts,
  initialHidden,
  systemDisplay = {},
}: {
  initialPaths: string[];
  initialSystemFolders: SystemFolderRow[];
  gameCounts: Record<string, number>;
  initialHidden: string[];
  /** slug → scraped icon URL + name (from the DB); falls back to the built-in
   *  glyph / registry name when a system isn't scraped. */
  systemDisplay?: Record<string, { icon: string | null; name: string }>;
}) {
  const [rows, setRows] = useState<MappingRow[]>(
    initialSystemFolders.map((f) => ({
      platform_slug: f.platform_slug,
      path: f.path,
      variant: f.variant ?? "",
    }))
  );
  const [roots, setRoots] = useState<string[]>(initialPaths);
  const [detectRoot, setDetectRoot] = useState(initialPaths[0] ?? "");
  const [menuSlug, setMenuSlug] = useState<string | null>(null); // action menu open for
  const [editSlug, setExpanded] = useState<string | null>(null); // folder editor open for
  const [hidden, setHidden] = useState<string[]>(initialHidden);
  // manufacturer groups the user has collapsed in the Systems list
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  // background scrape job + local scan-in-flight state, both shown as
  // Steam-style progress on the page
  const [job, setJob] = useState<ScrapeJob | null>(null);
  const [scanning, setScanning] = useState<string | null>(null);
  const router = useRouter();
  const t = useTranslations("settingsStorage");

  // poll the scrape job whenever one is (or might be) running
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function poll() {
      try {
        const res = await fetch("/api/scrape/job", { cache: "no-store" });
        const data = (await res.json()) as ScrapeJob;
        if (stop) return;
        setJob(data);
        if (data.running) timer = setTimeout(poll, 1500);
        else router.refresh();
      } catch {}
    }
    void poll();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
    // re-arm when a job starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.running]);

  const totalGames = Object.values(gameCounts).reduce((a, b) => a + b, 0);

  // systems present in the library or configured, biggest first
  const systems = PLATFORMS_SORTED.map((p) => ({
    p,
    games: gameCounts[p.slug] ?? 0,
    folders: rows.filter((r) => r.platform_slug === p.slug && r.path.trim()).length,
  }))
    .filter((s) => s.games > 0 || s.folders > 0)
    .sort((a, b) => b.games - a.games);

  // usage-bar segments: top 8 systems by game count, rest = "Other"
  const barTop = systems.filter((s) => s.games > 0).slice(0, 8);
  const otherGames = totalGames - barTop.reduce((a, s) => a + s.games, 0);

  // Systems grouped by manufacturer for the list below. Group order: the four
  // majors pinned first, then every other manufacturer A→Z; systems within a
  // group also sort A→Z.
  type SysEntry = (typeof systems)[number];
  const PINNED_VENDORS = ["Microsoft", "Nintendo", "Sega", "Sony"];
  const vendorGroups = (() => {
    const map = new Map<string, SysEntry[]>();
    for (const s of systems) {
      const v = platformVendor(s.p.slug);
      const arr = map.get(v);
      if (arr) arr.push(s);
      else map.set(v, [s]);
    }
    return [...map.entries()]
      .map(([vendor, sys]) => ({
        vendor,
        sys: [...sys].sort((a, b) => a.p.name.localeCompare(b.p.name)),
        games: sys.reduce((a, s) => a + s.games, 0),
      }))
      .sort((a, b) => {
        const ia = PINNED_VENDORS.indexOf(a.vendor);
        const ib = PINNED_VENDORS.indexOf(b.vendor);
        if (ia !== -1 && ib !== -1) return ia - ib; // both pinned → pinned order
        if (ia !== -1) return -1; // only a pinned → a first
        if (ib !== -1) return 1; // only b pinned → b first
        return a.vendor.localeCompare(b.vendor); // neither → alpha ascending
      });
  })();

  function updateRow(index: number, patch: Partial<MappingRow>) {
    setRows((cur) => cur.map((r, j) => (j === index ? { ...r, ...patch } : r)));
  }

  // Persist the hidden-systems list (shared by the per-system and the
  // per-manufacturer hide toggles).
  function applyHidden(next: string[]) {
    setHidden(next);
    void fetch("/api/settings/systems", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: next }),
    }).then(() => router.refresh());
  }

  // Hide or show every system under a manufacturer in one go.
  function setGroupHidden(slugs: string[], hide: boolean) {
    playSound(hide ? "toggleOff" : "toggleOn");
    const set = new Set(hidden);
    for (const s of slugs) {
      if (hide) set.add(s);
      else set.delete(s);
    }
    applyHidden([...set]);
  }

  async function save() {
    setBusy("save");
    setMsg("");
    try {
      const [sysRes, rootsRes] = await Promise.all([
        fetch("/api/settings/systems", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folders: rows
              .filter((r) => r.path.trim())
              .map((r) => ({
                platform_slug: r.platform_slug,
                path: r.path.trim(),
                variant: r.variant.trim() || null,
              })),
          }),
        }),
        fetch("/api/settings/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: roots.filter((p) => p.trim()) }),
        }),
      ]);
      setMsg(sysRes.ok && rootsRes.ok ? t("saved") : t("failedToSave"));
      playSound(sysRes.ok ? "confirm" : "bumperEnd");
      router.refresh();
    } finally {
      setBusy("");
    }
  }

  async function detect() {
    if (!detectRoot.trim()) return;
    setBusy("detect");
    setMsg(t("scanningSubfolders"));
    try {
      const res = await fetch("/api/settings/systems/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root: detectRoot }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? t("detectFailed"));
        return;
      }
      const matched: DetectedFolder[] = (data.proposals ?? []).filter(
        (p: DetectedFolder) => p.platform_slug
      );
      // build the merged folder list and persist it (root + folders) so the
      // path row needs no separate Save
      const next = [...rows];
      let added = 0;
      for (const m of matched) {
        if (next.some((r) => r.path.toLowerCase() === m.path.toLowerCase())) continue;
        next.push({ platform_slug: m.platform_slug!, path: m.path, variant: m.variant ?? "" });
        added++;
      }
      setRows(next);
      const nextRoots = roots.includes(detectRoot.trim()) ? roots : [...roots, detectRoot.trim()];
      setRoots(nextRoots);
      await Promise.all([
        fetch("/api/settings/systems", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folders: next
              .filter((r) => r.path.trim())
              .map((r) => ({ platform_slug: r.platform_slug, path: r.path.trim(), variant: r.variant.trim() || null })),
          }),
        }),
        fetch("/api/settings/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: nextRoots.filter((p) => p.trim()) }),
        }),
      ]);
      setMsg(t("matchedFolders", { matched: matched.length, added }));
      router.refresh();
    } finally {
      setBusy("");
    }
  }

  async function scan() {
    playSound("activate");
    setBusy("scan");
    try {
      const res = await fetch("/api/scan/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setMsg(res.ok ? t("scanStarted") : (data.error ?? t("scanFailedToStart")));
    } finally {
      setBusy("");
    }
  }

  // Check the supported-systems manifest and register any consoles missing from
  // the systems table (new systems added since it was last seeded).
  async function checkNewSystems() {
    playSound("activate");
    setBusy("newsystems");
    try {
      const res = await fetch("/api/settings/systems/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? t("checkNewSystemsFailed"));
        return;
      }
      const names: string[] = data.names ?? [];
      setMsg(
        names.length === 0
          ? t("allSystemsUpToDate")
          : t("addedNewSystems", { count: names.length, names: names.join(", ") })
      );
      if (names.length > 0) router.refresh();
    } finally {
      setBusy("");
    }
  }

  // rescan a single system in the background (surfaces in the header/downloads)
  async function rescanSystem(slug: string) {
    playSound("activate");
    setMenuSlug(null);
    setScanning(slug);
    try {
      await fetch("/api/scan/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systems: [slug] }),
      });
    } finally {
      setScanning(null);
    }
  }

  // start a background scrape for one system (all or missing-only)
  async function scrapeSystem(slug: string, onlyMissing: boolean) {
    playSound("activate");
    setMenuSlug(null);
    const res = await fetch("/api/scrape/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systems: [slug], onlyMissing }),
    });
    const data = await res.json();
    setJob(data.running !== undefined ? data : { running: true, total: 0, done: 0, current: "", systems: [slug] });
  }

  const platformName = (slug: string) =>
    PLATFORMS_SORTED.find((p) => p.slug === slug)?.name ?? slug;

  const activeJob = job?.running ? job : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Progress itself lives on the Downloads page — settings only notes that
          something is running and links there. */}
      {(activeJob || scanning) && (
        <div className="rounded-[3px] bg-[#23262e] px-4 py-3 text-[13px] text-body">
          {scanning ? t("rescanning", { name: platformName(scanning) }) : t("scrapeRunning")}
          {t("trackProgressOnThe")}{" "}
          <a href="/downloads" className="text-accent hover:underline">{t("downloadsPage")}</a>.
        </div>
      )}

      {/* Location card — Steam's drive pill */}
      <div className="flex w-fit items-center gap-4 rounded-[16px] bg-[#3d4450] px-6 py-4">
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-white">
          <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm2 12h12v2H6v-2Zm11-9a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
        </svg>
        <div>
          <div className="flex items-center gap-2 text-[18px] font-bold text-white">
            {t("romLibrary")} <span className="text-[#ffc82c]">★</span>
          </div>
          <div className="text-[13px] font-semibold uppercase tracking-wide text-dim">
            {t("gamesAcrossSystems", { total: totalGames.toLocaleString(), count: systems.length })}
          </div>
        </div>
      </div>

      {/* path label */}
      <div className="-mt-2 text-[12px] font-bold uppercase tracking-wide text-dim">
        {roots[0] || rows[0]?.path || t("noFoldersConfigured")}
      </div>

      {/* segmented usage bar + legend */}
      {totalGames > 0 && (
        <div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-black/40">
            {barTop.map((s) => (
              <div
                key={s.p.slug}
                style={{
                  width: `${(s.games / totalGames) * 100}%`,
                  backgroundColor: s.p.color || "#67707b",
                }}
                title={`${s.p.name}: ${s.games}`}
              />
            ))}
            {otherGames > 0 && (
              <div style={{ width: `${(otherGames / totalGames) * 100}%` }} className="bg-[#67707b]" />
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {barTop.map((s) => (
              <span key={s.p.slug} className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-body">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.p.color || "#67707b" }} />
                {s.p.shortName} <span className="text-dim">{s.games.toLocaleString()}</span>
              </span>
            ))}
            {otherGames > 0 && (
              <span className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-body">
                <span className="h-2.5 w-2.5 rounded-full bg-[#67707b]" /> {t("other")} <span className="text-dim">{otherGames.toLocaleString()}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Library folder + scan — Updates-section-style settings rows */}
      <div>
        <GpSubHeader>{t("library")}</GpSubHeader>
        {/* path row: text box + Browse, like System → Updates */}
        <div className="settings-row">
          <div className="min-w-0">
            <div className="text-[16px] text-body">{t("romLibraryFolder")}</div>
            <div className="mt-1 text-[12px] text-dim">
              {t("romLibraryFolderDesc")}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <input
              className="input-dark w-[340px] rounded-[2px] px-3 py-2 text-[15px]"
              placeholder={t("romRootPlaceholder")}
              value={detectRoot}
              onChange={(e) => setDetectRoot(e.target.value)}
            />
            <FolderPicker
              initialPath={detectRoot}
              onPick={setDetectRoot}
              title={t("chooseRomRootTitle")}
              triggerLabel={t("browse")}
            />
          </div>
        </div>
        {/* detect row */}
        <div className="settings-row">
          <div className="min-w-0">
            <div className="text-[16px] text-body">{t("detectSystems")}</div>
            <div className="mt-1 text-[12px] text-dim">
              {t("detectSystemsDesc")}
            </div>
          </div>
          <GpButton primary onClick={detect} disabled={busy !== "" || !detectRoot.trim()}>
            {busy === "detect" ? t("detecting") : t("detect")}
          </GpButton>
        </div>
        {/* scan-all row */}
        <div className="settings-row">
          <div className="min-w-0">
            <div className="text-[16px] text-body">{t("scanAllSystems")}</div>
            <div className="mt-1 text-[12px] text-dim">
              {t("scanAllDesc")}
            </div>
          </div>
          <GpButton onClick={scan} disabled={busy !== ""}>
            {busy === "scan" ? t("scanningInProgress") : t("scanAll")}
          </GpButton>
        </div>
        {/* check-for-new-systems row */}
        <div className="settings-row">
          <div className="min-w-0">
            <div className="text-[16px] text-body">{t("checkForNewSystems")}</div>
            <div className="mt-1 text-[12px] text-dim">
              {t("checkForNewSystemsDesc")}
            </div>
          </div>
          <GpButton onClick={checkNewSystems} disabled={busy !== ""}>
            {busy === "newsystems" ? t("checking") : t("check")}
          </GpButton>
        </div>
        {msg && <div className="mt-1 px-1 text-[13px] text-accent">{msg}</div>}
      </div>

      {/* Items list — grouped by manufacturer. Each group header collapses its
          systems and can hide/show the whole manufacturer at once; a system row
          click opens the folder editor. */}
      <div>
        <GpSubHeader>{t("systemsCount", { count: systems.length })}</GpSubHeader>
        {vendorGroups.map((g) => {
          const slugs = g.sys.map((s) => s.p.slug);
          const allHidden = slugs.every((s) => hidden.includes(s));
          const someHidden = !allHidden && slugs.some((s) => hidden.includes(s));
          const isCollapsed = collapsed.has(g.vendor);
          return (
            <div key={g.vendor}>
              {/* manufacturer header */}
              <div
                className={`flex items-center gap-2 border-b border-white/5 px-1 pb-1.5 pt-5 ${allHidden ? "opacity-50" : ""}`}
              >
                <button
                  onClick={() => {
                    playSound("activate");
                    setCollapsed((cur) => {
                      const next = new Set(cur);
                      if (next.has(g.vendor)) next.delete(g.vendor);
                      else next.add(g.vendor);
                      return next;
                    });
                  }}
                  className="Focusable flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                >
                  <span
                    className={`inline-block text-[13px] text-dim transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                  >
                    ›
                  </span>
                  <span className="truncate text-[13px] font-bold uppercase tracking-widest text-bright">
                    {g.vendor}
                  </span>
                  <span className="shrink-0 text-[12px] text-dim">
                    {t("groupSummary", { sysCount: g.sys.length, games: g.games.toLocaleString() })}
                    {someHidden && ` · ${t("someHidden")}`}
                  </span>
                </button>
                <button
                  onClick={() => setGroupHidden(slugs, !allHidden)}
                  className="Focusable flex shrink-0 cursor-pointer items-center gap-2 text-[12px] uppercase tracking-wide text-dim hover:text-body"
                  title={allHidden ? t("showAllVendor", { vendor: g.vendor }) : t("hideAllVendor", { vendor: g.vendor })}
                >
                  {allHidden ? t("hidden") : t("hideAll")}
                  <GpSwitch on={allHidden} />
                </button>
              </div>
              {/* systems in this group */}
              {!isCollapsed &&
                g.sys.map(({ p, games, folders }) => {
                  const isHidden = hidden.includes(p.slug);
                  return (
                    <button
                      key={p.slug}
                      onClick={() => {
                        playSound("activate");
                        setMenuSlug(p.slug);
                      }}
                      className={`settings-row Focusable w-full cursor-pointer text-left hover:bg-[#2b2f38] ${isHidden ? "opacity-50" : ""}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <SystemIcon platform={p} size="sm" iconUrl={systemDisplay[p.slug]?.icon} />
                        <div className="min-w-0">
                          <div className="truncate text-[16px] text-body">
                            {systemDisplay[p.slug]?.name ?? p.name}
                          </div>
                          <div className="text-[12px] text-dim">
                            {t("folderCount", { count: folders })}
                            {isHidden && ` · ${t("hidden")}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-[16px] font-medium text-bright">
                          {games.toLocaleString()}{" "}
                          <span className="text-[13px] font-normal text-dim">{t("games")}</span>
                        </span>
                        <span className="text-[18px] text-dim">›</span>
                      </div>
                    </button>
                  );
                })}
            </div>
          );
        })}
        {systems.length === 0 && (
          <div className="settings-row">
            <div className="text-[15px] text-dim">
              {t("noSystemsConfigured")}
            </div>
          </div>
        )}
      </div>

      {/* Per-system action menu — Edit / Rescan / Scrape */}
      {menuSlug &&
        (() => {
          const p = PLATFORMS_SORTED.find((x) => x.slug === menuSlug);
          if (!p) return null;
          const Action = ({ label, desc, onClick }: { label: string; desc: string; onClick: () => void }) => (
            <button
              onClick={onClick}
              className="settings-row Focusable w-full cursor-pointer text-left hover:bg-[#3d4450] hover:text-white"
            >
              <div>
                <div className="text-[16px] text-body">{label}</div>
                <div className="mt-0.5 text-[12px] text-dim">{desc}</div>
              </div>
              <span className="text-[18px] text-dim">›</span>
            </button>
          );
          return (
            <GpModal title={p.name} width={560} onClose={() => setMenuSlug(null)}>
              <div className="flex flex-col py-2">
                <Action
                  label={t("editFolders")}
                  desc={t("editFoldersDesc")}
                  onClick={() => {
                    setMenuSlug(null);
                    setExpanded(p.slug);
                  }}
                />
                <Action
                  label={t("rescan")}
                  desc={t("rescanDesc")}
                  onClick={() => rescanSystem(p.slug)}
                />
                <Action
                  label={t("scrapeMissing")}
                  desc={t("scrapeMissingDesc")}
                  onClick={() => scrapeSystem(p.slug, true)}
                />
                <Action
                  label={t("scrapeAll")}
                  desc={t("scrapeAllDesc")}
                  onClick={() => scrapeSystem(p.slug, false)}
                />
              </div>
            </GpModal>
          );
        })()}

      {/* Per-system folder editor — Steam-style submenu */}
      {editSlug &&
        (() => {
          const p = PLATFORMS_SORTED.find((x) => x.slug === editSlug);
          if (!p) return null;
          const entries = rows.map((r, index) => ({ ...r, index })).filter((r) => r.platform_slug === p.slug);
          const isHidden = hidden.includes(p.slug);
          return (
            <GpModal
              title={p.name}
              onClose={() => setExpanded(null)}
              footer={
                <>
                  <button
                    onClick={() => {
                      const next = isHidden ? hidden.filter((s) => s !== p.slug) : [...hidden, p.slug];
                      playSound(isHidden ? "toggleOn" : "toggleOff");
                      applyHidden(next);
                    }}
                    className="mr-auto flex cursor-pointer items-center gap-2 text-[14px] text-dim hover:text-body"
                  >
                    {t("hideFromLibrary")}
                    <GpSwitch on={isHidden} />
                  </button>
                  <GpButton onClick={() => setRows((cur) => [...cur, { platform_slug: p.slug, path: "", variant: "" }])}>
                    {t("addFolder")}
                  </GpButton>
                  <GpButton
                    primary
                    onClick={async () => {
                      await save();
                      setExpanded(null);
                    }}
                  >
                    {t("done")}
                  </GpButton>
                </>
              }
            >
              <div className="flex flex-col gap-2 py-2">
                {entries.length === 0 && (
                  <p className="px-1 py-2 text-[14px] text-dim">
                    {t("noFoldersForSystem", { name: p.shortName })}
                  </p>
                )}
                {entries.map((entry) => (
                  <div key={entry.index} className="flex flex-wrap items-center gap-2">
                    <input
                      className="input-dark min-w-64 flex-1 rounded-[2px] px-3 py-2 text-[15px]"
                      placeholder={t("pathToFolderPlaceholder", { name: p.shortName })}
                      value={entry.path}
                      onChange={(e) => updateRow(entry.index, { path: e.target.value })}
                    />
                    <FolderPicker initialPath={entry.path} onPick={(path) => updateRow(entry.index, { path })} title={t("chooseFolderTitle", { name: p.shortName })} />
                    <input
                      className="input-dark w-36 rounded-[2px] px-3 py-2 text-[15px]"
                      placeholder={t("mainLibraryPlaceholder")}
                      value={entry.variant}
                      onChange={(e) => updateRow(entry.index, { variant: e.target.value })}
                      title={t("variantTitle")}
                    />
                    <GpButton onClick={() => setRows((cur) => cur.filter((_, j) => j !== entry.index))}>
                      {t("remove")}
                    </GpButton>
                  </div>
                ))}
              </div>
            </GpModal>
          );
        })()}
    </div>
  );
}
