"use client";

import { GpSlider, GpSwitch } from "@/components/bpm/primitives";

// SteamOS Quick Access menu (the "···" menu): slides in from the right.
// Open: ··· button in the top bar or controller Select/Back.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import GameCover from "./GameCover";
import { platformBySlug } from "@/lib/platforms";
import { setChromeOverlay } from "@/lib/chromeOverlay";
import {
  playSound,
  soundsEnabled,
  setSoundsEnabled,
  soundVolume,
  setSoundVolume,
  themeMusicEnabled,
  setThemeMusicEnabled,
} from "@/lib/sounds";
import type { Notification } from "@/lib/notifications";

export interface QuickResume {
  id: number;
  title: string;
  boxart_url: string | null;
  platform_slug: string;
  playable: boolean;
}

function timeAgo(iso: string, t: (key: string, values?: Record<string, number>) => string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return t("justNow");
  const m = Math.floor(s / 60);
  if (m < 60) return t("minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("hoursAgo", { count: h });
  const d = Math.floor(h / 24);
  return d < 7 ? t("daysAgo", { count: d }) : new Date(iso).toLocaleDateString();
}

export default function QuickAccess({
  isAdmin,
  username,
  avatarUrl,
  recent,
}: {
  isAdmin: boolean;
  username: string;
  avatarUrl: string | null;
  recent: QuickResume[];
}) {
  const t = useTranslations("quickAccess");
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  const [fullscreen, setFullscreen] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [scanning, setScanning] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const [sounds, setSounds] = useState(true);
  const [volume, setVolume] = useState(1);
  const [themeMusic, setThemeMusic] = useState(true);

  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  const loadNotifs = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      // Quick Access shows only UNREAD items — a glanceable, actionable list.
      // The header bell keeps the full read/unread history.
      setNotifs((data.notifications ?? []).filter((n: Notification) => !n.read).slice(0, 4));
      setUnread(data.unread ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    setSounds(soundsEnabled());
    setVolume(soundVolume());
    setThemeMusic(themeMusicEnabled());
    const onOpen = () =>
      setOpen((o) => {
        playSound(o ? "menuClose" : "menuOpen");
        return !o;
      });
    const onB = (e: Event) => {
      if (openRef.current) {
        e.preventDefault();
        playSound("menuClose");
        setOpen(false);
      }
    };
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    window.addEventListener("gh-quickaccess", onOpen);
    window.addEventListener("gh-b", onB);
    document.addEventListener("fullscreenchange", onFs);
    onFs();
    return () => {
      window.removeEventListener("gh-quickaccess", onOpen);
      window.removeEventListener("gh-b", onB);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  // Focus the first control and pull fresh notifications each time it opens.
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    void loadNotifs();
  }, [open, loadNotifs]);

  // Tell the header/footer to go near-opaque while the panel is open.
  useEffect(() => {
    setChromeOverlay("quickaccess", open);
    return () => setChromeOverlay("quickaccess", false);
  }, [open]);

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  async function scanNow() {
    setScanning(true);
    setScanMsg(t("scanning"));
    try {
      const res = await fetch("/api/scan/job", { method: "POST" });
      const data = await res.json();
      setScanMsg(
        res.ok ? t("scanStarted") : t("scanFailed", { error: data.error ?? t("scanFailedGeneric") })
      );
    } finally {
      setScanning(false);
    }
  }

  async function markAllRead() {
    playSound("confirm");
    setUnread(0);
    setNotifs([]); // unread-only list — clearing read empties it
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      /* ignore */
    }
  }

  function onNotifClick(n: Notification) {
    setOpen(false);
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      void fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: [n.key] }),
      });
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    router.push("/login");
    router.refresh();
  }

  if (!open) return null;

  const resume = recent[0] ?? null;
  const resumePlatform = resume ? platformBySlug(resume.platform_slug) : undefined;
  const more = recent.slice(1, 6);

  return (
    // gh-tab-quickaccess scopes the theme's QuickAccess.css here (CSS Loader
    // injects it into the Quick Access window only, not the main page)
    <div className="gh-tab-quickaccess fixed inset-x-0 bottom-[42px] top-10 z-[95]" data-overlay="open">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setOpen(false)} />
      {/* panel geometry from the live BPM capture: #0e141b surface */}
      <div
        ref={panel}
        className="overlay-right quickaccessmenu_QuickAccessMenu_gh quickaccessmenu_Menu_gh quickaccessmenu_Container_gh absolute inset-y-0 right-0 flex w-[340px] flex-col gap-1 overflow-y-auto bg-[#0e141b] pt-[14px] shadow-2xl"
      >
        <div className="quickaccessmenu_Title_gh px-5 pb-2 pt-5 text-xs font-bold uppercase tracking-[0.25em] text-dim">
          {t("title")}
        </div>

        {/* Notifications — recent few, mirroring the header bell */}
        {notifs.length > 0 && (
          <>
            <div className="flex items-center justify-between px-5 pt-3">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-dim">{t("notifications")}</span>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="Focusable cursor-pointer text-[11px] font-semibold text-accent hover:brightness-125"
                >
                  {t("markAllRead")}
                </button>
              )}
            </div>
            <div className="mx-2 mb-1">
              {notifs.map((n) => {
                const inner = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] ${n.read ? "text-dim" : "font-semibold text-body"}`}>
                        {n.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-white/35">{timeAgo(n.createdAt, t)}</span>
                    </span>
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />}
                  </>
                );
                const cls =
                  "Focusable flex w-full items-start gap-2 rounded px-3 py-2 text-left hover:bg-white/5";
                return n.external ? (
                  <a key={n.key} href={n.href} target="_blank" rel="noopener noreferrer" onClick={() => onNotifClick(n)} className={cls}>
                    {inner}
                  </a>
                ) : (
                  <Link key={n.key} href={n.href ?? "#"} onClick={() => onNotifClick(n)} className={cls}>
                    {inner}
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {/* Resume + recent */}
        {resume && (
          <div className="mx-4 mb-2 shrink-0 overflow-hidden rounded bg-white/5">
            <div className="flex items-center gap-3 p-3">
              <GameCover
                title={resume.title}
                boxartUrl={resume.boxart_url}
                color={resumePlatform?.color}
                shortName={resumePlatform?.shortName}
                className="h-16 w-12 shrink-0 rounded"
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-bright">{resume.title}</div>
                <div className="text-xs text-dim">{resumePlatform?.shortName}</div>
              </div>
            </div>
            <Link
              href={resume.playable ? `/play/${resume.id}` : `/game/${resume.id}`}
              onClick={() => setOpen(false)}
              className="btn-play block px-3 py-2 text-center text-sm"
            >
              ▶ &nbsp;{resume.playable ? t("resume") : t("open")}
            </Link>
          </div>
        )}
        {more.length > 0 && (
          <div className="no-scrollbar mx-4 mb-2 flex shrink-0 gap-2 overflow-x-auto">
            {more.map((g) => {
              const p = platformBySlug(g.platform_slug);
              return (
                <Link
                  key={g.id}
                  href={`/game/${g.id}`}
                  onClick={() => setOpen(false)}
                  title={g.title}
                  className="deck-capsule block w-12 shrink-0"
                >
                  <span className="block h-16 w-12 overflow-hidden rounded bg-[#0e141b]">
                    <GameCover title={g.title} boxartUrl={g.boxart_url} color={p?.color} shortName={p?.shortName} className="h-full w-full" />
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        {/* Quick settings */}
        <div className="px-5 pt-3 text-xs font-bold uppercase tracking-[0.25em] text-dim">{t("quickSettings")}</div>
        <button
          onClick={() => {
            playSound(fullscreen ? "toggleOff" : "toggleOn");
            toggleFullscreen();
          }}
          className="menu-item justify-between"
          role="switch"
          aria-checked={fullscreen}
        >
          <span className="flex items-center gap-3">
            <span className="w-5 text-center opacity-70">⛶</span>
            {t("fullscreen")}
          </span>
          <GpSwitch on={fullscreen} />
        </button>
        <button
          onClick={() => {
            const next = !sounds;
            setSoundsEnabled(next);
            setSounds(next);
            if (next) playSound("toggleOn");
          }}
          className="menu-item justify-between"
          role="switch"
          aria-checked={sounds}
        >
          <span className="flex items-center gap-3">
            <span className="w-5 text-center opacity-70">♪</span>
            {t("uiSounds")}
          </span>
          <GpSwitch on={sounds} />
        </button>
        {sounds && (
          <div className="flex items-center gap-3 px-5 py-1.5">
            <span className="w-5 text-center opacity-70">🔊</span>
            <GpSlider
              value={volume}
              onChange={(v) => {
                setVolume(v);
                setSoundVolume(v);
              }}
              onCommit={() => playSound("navigate")}
              width={244}
              label={t("volume")}
            />
          </div>
        )}
        <button
          onClick={() => {
            const next = !themeMusic;
            setThemeMusicEnabled(next);
            setThemeMusic(next);
            playSound(next ? "toggleOn" : "toggleOff");
          }}
          className="menu-item justify-between"
          role="switch"
          aria-checked={themeMusic}
        >
          <span className="flex items-center gap-3">
            <span className="w-5 text-center opacity-70">♫</span>
            {t("themeMusic")}
          </span>
          <GpSwitch on={themeMusic} />
        </button>

        {isAdmin && (
          <>
            <div className="px-5 pt-3 text-xs font-bold uppercase tracking-[0.25em] text-dim">{t("admin")}</div>
            <button onClick={scanNow} disabled={scanning} className="menu-item">
              <span className="w-5 text-center opacity-70">⟳</span>
              {t("scanLibrary")}
            </button>
            {scanMsg && <div className="px-6 pb-2 text-xs text-body">{scanMsg}</div>}
            <Link href="/settings" onClick={() => setOpen(false)} className="menu-item">
              <span className="w-5 text-center opacity-70">⚙</span>
              {t("allSettings")}
            </Link>
          </>
        )}

        {/* Account */}
        <div className="mt-auto shrink-0 border-t border-white/10 pt-2">
          <div className="flex items-center gap-3 px-5 pb-1 pt-2">
            <span className="h-8 w-8 shrink-0 overflow-hidden rounded bg-[#3d4450]">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm font-black text-white">
                  {username.slice(0, 1).toUpperCase()}
                </span>
              )}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-bright">{username}</div>
              <div className="text-[11px] text-dim">{t("signedIn")}</div>
            </div>
          </div>
          <Link href="/account" onClick={() => setOpen(false)} className="menu-item">
            <span className="w-5 text-center opacity-70">👤</span>
            {t("account")}
          </Link>
          <Link href="/account/friends" onClick={() => setOpen(false)} className="menu-item">
            <span className="w-5 text-center opacity-70">🤝</span>
            {t("friends")}
          </Link>
          <button onClick={signOut} className="menu-item text-[#e0685f]">
            <span className="w-5 text-center opacity-70">⇥</span>
            {t("signOut")}
          </button>
        </div>
      </div>
    </div>
  );
}
