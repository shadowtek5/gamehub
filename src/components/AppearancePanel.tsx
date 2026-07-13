"use client";

import {
  GpConfirm,
  GpDropdown,
  GpToggle,
  GpRow,
  GpModal,
  GpButton,
  GpSubHeader,
} from "@/components/bpm/primitives";

// Settings → Appearance: browse & install CSS themes from deckthemes.com,
// toggle installed ones on/off, and configure their options (patches +
// color pickers) CSS Loader-style. Dependencies auto-installed alongside a
// theme are nested under it, not listed as peers. Applied app-wide via the
// root layout.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

interface RemoteTheme {
  id: string;
  name: string;
  author: string;
  version: string;
  target: string;
  stars: number;
  downloads: number;
  imageId: string | null;
  installed: boolean;
}

interface PatchComponent {
  name: string;
  type: string;
  on: string;
  default: string;
  css_variable: string;
}

interface Patch {
  name: string;
  type: string; // dropdown | checkbox | slider | none
  default: string;
  values: Record<string, unknown>;
  components?: PatchComponent[];
}

interface InstalledTheme {
  id: string;
  name: string;
  author: string;
  version: string;
  target: string;
  enabled: boolean;
  patches: Patch[];
  selected: Record<string, string>;
  componentValues?: Record<string, string>;
  /** declared deps (by theme name), CSS Loader-style */
  dependencies?: Record<string, Record<string, string>>;
  dependencyOf?: string | null;
}

export default function AppearancePanel() {
  const [installed, setInstalled] = useState<InstalledTheme[]>([]);
  const [results, setResults] = useState<RemoteTheme[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [order, setOrder] = useState("Most Downloaded");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [confirmingUninstall, setConfirmingUninstall] = useState<InstalledTheme | null>(null);
  const [filter, setFilter] = useState("All");
  const [filters, setFilters] = useState<string[]>([]);
  const router = useRouter();
  const tr = useTranslations("appearance");

  const loadInstalled = useCallback(async () => {
    try {
      const res = await fetch("/api/themes", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setInstalled(data.themes ?? []);
      }
    } catch {}
  }, []);

  const search = useCallback(
    async (query: string, pg: number, ord: string, flt: string) => {
      setBusy("search");
      setMsg("");
      try {
        const res = await fetch(
          `/api/themes/search?q=${encodeURIComponent(query)}&page=${pg}&order=${encodeURIComponent(ord)}&filter=${encodeURIComponent(flt)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!res.ok) {
          setMsg(`✗ ${data.error ?? tr("searchFailed")}`);
          return;
        }
        setResults(data.items ?? []);
        setTotal(data.total ?? 0);
      } catch {
        setMsg(`✗ ${tr("deckthemesUnreachable")}`);
      } finally {
        setBusy("");
      }
    },
    []
  );

  useEffect(() => {
    void loadInstalled();
    void search("", 1, "Most Downloaded", "All");
    // available store targets (System-Wide, Tweak, Snippet, …)
    fetch("/api/themes/search?meta=filters", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.filters) setFilters(Object.keys(d.filters));
      })
      .catch(() => {});
  }, [loadInstalled, search]);

  async function install(t: RemoteTheme) {
    playSound("activate");
    setBusy(t.id);
    setMsg("");
    try {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`✗ ${data.error ?? tr("installFailed")}`);
        return;
      }
      playSound("confirm");
      setResults((r) => r.map((x) => (x.id === t.id ? { ...x, installed: true } : x)));
      await loadInstalled();
      router.refresh();
    } finally {
      setBusy("");
    }
  }

  async function toggle(t: InstalledTheme) {
    playSound(t.enabled ? "toggleOff" : "toggleOn");
    await fetch(`/api/themes/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !t.enabled }),
    });
    await loadInstalled();
    router.refresh();
  }

  async function uninstall(t: InstalledTheme) {
    playSound("activate");
    await fetch(`/api/themes/${t.id}`, { method: "DELETE" });
    await loadInstalled();
    setResults((r) => r.map((x) => (x.id === t.id ? { ...x, installed: false } : x)));
    router.refresh();
  }

  async function setPatch(t: InstalledTheme, patch: string, value: string) {
    await fetch(`/api/themes/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selected: { [patch]: value } }),
    });
    await loadInstalled();
    router.refresh();
  }

  async function setComponent(t: InstalledTheme, name: string, value: string) {
    await fetch(`/api/themes/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ componentValues: { [name]: value } }),
    });
    await loadInstalled();
    router.refresh();
  }

  /** One patch option as a Steam settings row: checkbox patches render as a
   *  toggle, everything else as a dropdown of its values; color-picker
   *  components appear when their activating value is selected. */
  function PatchRow({ theme, patch }: { theme: InstalledTheme; patch: Patch }) {
    const value = theme.selected[patch.name] ?? patch.default;
    const valueKeys = Object.keys(patch.values);
    const isCheckbox =
      patch.type === "checkbox" ||
      (valueKeys.length === 2 && valueKeys.every((v) => v === "Yes" || v === "No"));
    const activeComponents = (patch.components ?? []).filter((c) => c.on === value);
    return (
      <>
        <GpRow label={patch.name}>
          {isCheckbox ? (
            <GpToggle
              on={value === "Yes"}
              onChange={(v) => void setPatch(theme, patch.name, v ? "Yes" : "No")}
              label={patch.name}
            />
          ) : (
            <GpDropdown
              value={value}
              width={200}
              onChange={(v) => void setPatch(theme, patch.name, v)}
              options={valueKeys.map((v) => ({ value: v, label: v }))}
            />
          )}
        </GpRow>
        {activeComponents.map((c) => (
          <GpRow key={c.name} label={c.name}>
            <input
              type="color"
              value={theme.componentValues?.[c.name] ?? c.default}
              onChange={(e) => void setComponent(theme, c.name, e.target.value)}
              className="h-8 w-14 cursor-pointer rounded-[2px] border-0 bg-white/15 p-1"
              title={c.name}
            />
          </GpRow>
        ))}
      </>
    );
  }

  /** Installed theme = a Steam settings row: status + a Configure button
   *  that opens the options DIALOG (BPM never uses accordions — row →
   *  modal, like Steam's own settings). Enable/disable and Uninstall both
   *  live in the dialog; the row just reports the state. */
  function ThemeRow({ t }: { t: InstalledTheme }) {
    return (
      <GpRow label={t.name} description={`${t.version} · ${t.author}`}>
        <div className="flex shrink-0 items-center gap-4">
          <span
            className={`gamepaddialog_LabelFieldValue_gh text-[13px] font-bold uppercase tracking-wider ${
              t.enabled ? "text-accent" : "text-dim"
            }`}
          >
            {t.enabled ? tr("enabled") : tr("disabled")}
          </span>
          <GpButton onClick={() => setConfiguring(t.id)} className="!py-1.5 text-sm">
            {tr("configure")}
          </GpButton>
        </div>
      </GpRow>
    );
  }

  /** The Configure dialog: the theme's own options, then each installed
   *  dependency as a section with its enable toggle + options. */
  function ConfigureModal({ t }: { t: InstalledTheme }) {
    const deps = installed.filter((d) => d.name in (t.dependencies ?? {}) && d.id !== t.id);
    return (
      <GpModal
        title={tr("themeSettings", { name: t.name })}
        width={620}
        onClose={() => setConfiguring(null)}
        footer={
          <>
            <GpButton
              onClick={() => {
                setConfiguring(null);
                setConfirmingUninstall(t);
              }}
              className="mr-auto !bg-[#a33a3a] hover:!bg-[#c04545]"
            >
              {tr("uninstall")}
            </GpButton>
            <GpButton primary onClick={() => setConfiguring(null)}>
              {tr("close")}
            </GpButton>
          </>
        }
      >
        <div className="flex flex-col gap-1.5 pb-2">
          <GpRow label={tr("enabled")} description={tr("applyForEveryone")}>
            <GpToggle on={t.enabled} onChange={() => void toggle(t)} label={tr("themeEnabledToggle", { name: t.name })} />
          </GpRow>
          {t.patches.map((p) => (
            <PatchRow key={p.name} theme={t} patch={p} />
          ))}
          {deps.map((d) => (
            <div key={d.id} className="mt-2">
              <GpSubHeader>
                {d.name}
                <span className="ml-2 align-middle rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dim">
                  {tr("dependency")}
                </span>
              </GpSubHeader>
              <GpRow label={tr("enabled")} description={`${d.version} · ${d.author}`}>
                <GpToggle on={d.enabled} onChange={() => void toggle(d)} label={tr("themeEnabledToggle", { name: d.name })} />
              </GpRow>
              {d.patches.map((p) => (
                <PatchRow key={p.name} theme={d} patch={p} />
              ))}
            </div>
          ))}
        </div>
      </GpModal>
    );
  }

  const label = "text-xs font-bold uppercase tracking-widest text-dim";

  return (
    <div>
      <GpSubHeader>{tr("heading")}</GpSubHeader>
      <p className="mb-5 text-[13px] leading-relaxed text-dim">
        {tr("introPrefix")}{" "}
        <a href="https://deckthemes.com" target="_blank" rel="noreferrer" className="text-accent hover:underline">
          deckthemes.com
        </a>{" "}
        {tr("introSuffix")}
      </p>

      {installed.length > 0 && (
        <>
          <div className={`${label} mb-2`}>{tr("installedThemes")}</div>
          <div className="mb-6 flex flex-col gap-1.5">
            {installed
              // top level = themes no other installed theme declares as a dependency
              .filter((t) => !installed.some((p) => p.id !== t.id && t.name in (p.dependencies ?? {})))
              .map((t) => (
                <ThemeRow key={t.id} t={t} />
              ))}
          </div>
        </>
      )}
      {configuring &&
        (() => {
          const t = installed.find((x) => x.id === configuring);
          return t ? <ConfigureModal t={t} /> : null;
        })()}
      {confirmingUninstall && (
        <GpConfirm
          title={tr("uninstallConfirmTitle", { name: confirmingUninstall.name })}
          confirmLabel={tr("uninstall")}
          danger
          onConfirm={() => void uninstall(confirmingUninstall)}
          onClose={() => setConfirmingUninstall(null)}
        >
          {tr("uninstallConfirmBody")}
        </GpConfirm>
      )}

      <div className={`${label} mb-2`}>{tr("browseDeckthemes")}</div>
      <div className="gamepaddialog_Field_gh mb-3 rounded-[3px] bg-[#23262e] p-2">
      <div className="gamepaddialog_FieldChildren_gh flex flex-wrap gap-2">
        <input
          className="input-dark min-w-0 flex-1 px-3 py-2 text-sm"
          placeholder={tr("searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(1);
              void search(q, 1, order, filter);
            }
          }}
        />
        <GpDropdown
          value={order}
          width={200}
          onChange={(v) => {
            setOrder(v);
            setPage(1);
            void search(q, 1, v, filter);
          }}
          options={[
            { value: "Most Downloaded", label: tr("orderMostDownloaded") },
            { value: "Last Updated", label: tr("orderLastUpdated") },
            { value: "Newest", label: tr("orderNewest") },
            { value: "Alphabetical (A to Z)", label: tr("orderAlphabetical") },
          ]}
        />
        <GpDropdown
          value={filter}
          width={160}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
            void search(q, 1, order, v);
          }}
          options={[
            { value: "All", label: tr("allTargets") },
            ...filters.map((v) => ({ value: v, label: v })),
          ]}
        />
        <GpButton
          onClick={() => {
            setPage(1);
            void search(q, 1, order, filter);
          }}
          disabled={busy === "search"}
          className="shrink-0"
        >
          {busy === "search" ? tr("searching") : tr("search")}
        </GpButton>
      </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((t) => (
          <div key={t.id} className="gamepaddialog_Field_gh overflow-hidden rounded-[4px] bg-[#23262e]">
            <div className="aspect-video w-full bg-black/40">
              {t.imageId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/themes/image/${t.imageId}`}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              )}
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 truncate text-sm font-semibold text-body" title={t.name}>
                  {t.name}
                </span>
                {t.target && (
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dim">
                    {t.target}
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-xs text-dim">
                {t.author} · {t.version} · ★ {t.stars.toLocaleString()} · ⬇{" "}
                {t.downloads.toLocaleString()}
              </div>
              <div className="gamepaddialog_FieldChildren_gh mt-2">
                <GpButton
                  primary
                  onClick={() => install(t)}
                  disabled={t.installed || busy === t.id}
                  className="w-full"
                >
                  {t.installed ? tr("installed") : busy === t.id ? tr("installing") : tr("install")}
                </GpButton>
              </div>
            </div>
          </div>
        ))}
      </div>
      {total > 12 && (
        <div className="gamepaddialog_Field_gh gamepaddialog_FieldLabelRow_gh mt-3"><div className="gamepaddialog_FieldChildren_gh flex items-center justify-center gap-4 text-sm">
          <GpButton
            onClick={() => {
              const p = Math.max(1, page - 1);
              setPage(p);
              void search(q, p, order, filter);
            }}
            disabled={page <= 1}
          >
            {tr("prev")}
          </GpButton>
          <span className="text-dim">
            {tr("pageIndicator", { page, pages: Math.ceil(total / 12) })}
          </span>
          <GpButton
            onClick={() => {
              const p = page + 1;
              setPage(p);
              void search(q, p, order, filter);
            }}
            disabled={page >= Math.ceil(total / 12)}
          >
            {tr("next")}
          </GpButton>
        </div></div>
      )}

      {msg && (
        <div className={`mt-3 text-sm ${msg.startsWith("✓") ? "text-accent" : "text-danger"}`}>{msg}</div>
      )}
    </div>
  );
}
