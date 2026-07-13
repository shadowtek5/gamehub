"use client";

// Settings → Audio: GameHub's audio prefs plus the AudioLoader integration —
// pick one sound pack and one music pack from deckthemes.com (SDH-AudioLoader
// packs), with separate volumes, and browse/install/uninstall packs. All
// changes auto-save; the new pack applies on the next page load.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GpRow, GpSubHeader, GpToggle, GpDropdown, GpButton, GpSlider, GpConfirm } from "./primitives";
import {
  playSound,
  soundsEnabled,
  setSoundsEnabled,
  themeMusicEnabled,
  setThemeMusicEnabled,
} from "@/lib/sounds";

interface AudioPack {
  id: string;
  name: string;
  author: string;
  version: string;
  target: string;
  music: boolean;
}

interface AudioConfig {
  selected_pack: string;
  selected_music: string;
  sound_volume: number;
  music_volume: number;
}

interface RemotePack {
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

function VolumeSlider({
  value,
  onCommit,
  label,
}: {
  value: number;
  onCommit: (v: number) => void;
  label: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="flex items-center gap-3">
      <GpSlider value={v} onChange={setV} onCommit={onCommit} width={224} label={label} />
      <span className="w-10 text-right text-xs tabular-nums text-dim">
        {Math.round(v * 100)}%
      </span>
    </div>
  );
}

export default function SettingsAudio({ isAdmin = false }: { isAdmin?: boolean }) {
  const [sounds, setSounds] = useState(true);
  const [themeMusic, setThemeMusic] = useState(true);
  const [packs, setPacks] = useState<AudioPack[]>([]);
  const [config, setConfig] = useState<AudioConfig | null>(null);
  const [results, setResults] = useState<RemotePack[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("All");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmingUninstall, setConfirmingUninstall] = useState<AudioPack | null>(null);
  const router = useRouter();
  const t = useTranslations("settingsAudioGroup.audio");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/audio", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setPacks(data.packs ?? []);
        setConfig(data.config ?? null);
      }
    } catch {}
  }, []);

  const search = useCallback(async (query: string, flt: string) => {
    setBusy("search");
    try {
      const res = await fetch(
        `/api/audio/search?q=${encodeURIComponent(query)}&filter=${encodeURIComponent(flt)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (res.ok) setResults(data.items ?? []);
      else setMsg(`✗ ${data.error ?? t("searchFailed")}`);
    } catch {
      setMsg(t("unreachable"));
    } finally {
      setBusy("");
    }
  }, []);

  useEffect(() => {
    setSounds(soundsEnabled());
    setThemeMusic(themeMusicEnabled());
    void load();
    if (isAdmin) void search("", "All");
  }, [load, search, isAdmin]);

  async function patchConfig(changes: Partial<AudioConfig>) {
    const res = await fetch("/api/audio", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const data = await res.json();
    if (res.ok) setConfig(data.config);
    router.refresh();
  }

  async function install(p: RemotePack) {
    playSound("activate");
    setBusy(p.id);
    setMsg("");
    try {
      const res = await fetch("/api/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`✗ ${data.error ?? t("installFailed")}`);
        return;
      }
      playSound("confirm");
      setResults((r) => r.map((x) => (x.id === p.id ? { ...x, installed: true } : x)));
      await load();
    } finally {
      setBusy("");
    }
  }

  async function uninstall(p: AudioPack) {
    playSound("activate");
    await fetch(`/api/audio/${p.id}`, { method: "DELETE" });
    await load();
    setResults((r) => r.map((x) => (x.id === p.id ? { ...x, installed: false } : x)));
    router.refresh();
  }

  const soundPacks = packs.filter((p) => !p.music);
  const musicPacks = packs.filter((p) => p.music);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <GpSubHeader>{t("general")}</GpSubHeader>
        <GpRow
          label={t("uiSounds")}
          description={t("uiSoundsDesc")}
        >
          <GpToggle
            on={sounds}
            onChange={(v) => {
              setSounds(v);
              setSoundsEnabled(v);
            }}
            label={t("uiSounds")}
          />
        </GpRow>
        <GpRow
          label={t("gameThemeMusic")}
          description={t("gameThemeMusicDesc")}
        >
          <GpToggle
            on={themeMusic}
            onChange={(v) => {
              setThemeMusic(v);
              setThemeMusicEnabled(v);
            }}
            label={t("gameThemeMusic")}
          />
        </GpRow>
      </div>

      <div>
        <GpSubHeader>{t("packs")}</GpSubHeader>
        <GpRow
          label={t("soundPack")}
          description={t("soundPackDesc")}
        >
          <GpDropdown
            value={config?.selected_pack ?? "Default"}
            width={240}
            disabled={!isAdmin}
            onChange={(v) => void patchConfig({ selected_pack: v })}
            options={[
              { value: "Default", label: t("default") },
              ...soundPacks.map((p) => ({ value: p.name, label: p.name })),
            ]}
          />
        </GpRow>
        <GpRow label={t("soundEffectsVolume")}>
          <VolumeSlider
            value={config?.sound_volume ?? 1}
            onCommit={(v) => {
              void patchConfig({ sound_volume: v });
              playSound("navigate");
            }}
            label={t("soundEffectsVolume")}
          />
        </GpRow>
        <GpRow
          label={t("musicPack")}
          description={t("musicPackDesc")}
        >
          <GpDropdown
            value={config?.selected_music ?? "None"}
            width={240}
            disabled={!isAdmin}
            onChange={(v) => void patchConfig({ selected_music: v })}
            options={[
              { value: "None", label: t("none") },
              ...musicPacks.map((p) => ({ value: p.name, label: p.name })),
            ]}
          />
        </GpRow>
        <GpRow label={t("musicVolume")}>
          <VolumeSlider
            value={config?.music_volume ?? 0.5}
            onCommit={(v) => void patchConfig({ music_volume: v })}
            label={t("musicVolume")}
          />
        </GpRow>
      </div>

      {isAdmin && packs.length > 0 && (
        <div>
          <GpSubHeader>{t("installedPacks")}</GpSubHeader>
          {packs.map((p) => (
            <GpRow
              key={p.id}
              label={p.name}
              description={`${p.version} · ${p.author} · ${p.music ? t("music") : t("sounds")}`}
            >
              <GpButton onClick={() => setConfirmingUninstall(p)} className="!py-1.5 text-sm">
                {t("uninstall")}
              </GpButton>
            </GpRow>
          ))}
        </div>
      )}

      {isAdmin && (
        <div>
          <GpSubHeader>{t("browseHeader")}</GpSubHeader>
          <div className="gamepaddialog_Field_gh mb-3 rounded-[3px] bg-[#23262e] p-2">
          <div className="gamepaddialog_FieldChildren_gh flex flex-wrap gap-2">
            <input
              className="input-dark min-w-0 flex-1 px-3 py-2 text-sm"
              placeholder={t("searchPlaceholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void search(q, filter);
              }}
            />
            <GpDropdown
              value={filter}
              width={140}
              onChange={(v) => {
                setFilter(v);
                void search(q, v);
              }}
              options={[
                { value: "All", label: t("all") },
                { value: "Audio", label: t("sounds") },
                { value: "Music", label: t("music") },
              ]}
            />
            <GpButton onClick={() => void search(q, filter)} disabled={busy === "search"}>
              {busy === "search" ? t("searching") : t("search")}
            </GpButton>
          </div>
          </div>
          {msg && <p className="mb-2 text-sm text-danger">{msg}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((p) => (
              <div key={p.id} className="gamepaddialog_Field_gh overflow-hidden rounded-[4px] bg-[#23262e]">
                <div className="aspect-video w-full bg-black/40">
                  {p.imageId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/themes/image/${p.imageId}`}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-body" title={p.name}>
                      {p.name}
                    </span>
                    <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dim">
                      {p.target === "Music" ? t("music") : t("sounds")}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-dim">
                    {p.version} · {p.author} · ★ {p.stars} · ⬇ {p.downloads.toLocaleString()}
                  </div>
                  <div className="gamepaddialog_FieldChildren_gh mt-2">
                    {p.installed ? (
                      <span className="text-xs text-accent">{t("installedBadge")}</span>
                    ) : (
                      <GpButton
                        primary
                        onClick={() => void install(p)}
                        disabled={busy === p.id}
                        className="!py-1 text-sm"
                      >
                        {busy === p.id ? t("installing") : t("install")}
                      </GpButton>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}
      {confirmingUninstall && (
        <GpConfirm
          title={t("uninstallConfirmTitle", { name: confirmingUninstall.name })}
          confirmLabel={t("uninstall")}
          danger
          onConfirm={() => {
            const p = confirmingUninstall;
            void uninstall(p);
          }}
          onClose={() => setConfirmingUninstall(null)}
        />
      )}
    </div>
  );
}
