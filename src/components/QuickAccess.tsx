"use client";

import { GpSlider, GpSwitch, GpDropdown } from "@/components/bpm/primitives";

// SteamOS Quick Access menu (the "···" menu): slides in from the right.
// Open: ··· button in the top bar or controller Select/Back.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import GameCover from "./GameCover";
import { LOCALES_FOR_PICKER, LOCALE_COOKIE, LOCALE_LABELS, type Locale } from "@/i18n/locales";
import { platformBySlug } from "@/lib/platforms";
import { setChromeOverlay, useExclusiveOverlay } from "@/lib/chromeOverlay";
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
  const tLang = useTranslations("settings.language");
  const activeLocale = useLocale() as Locale;
  const [lang, setLang] = useState<Locale>(activeLocale);
  const langOptions = LOCALES_FOR_PICKER.map((code) => ({
    value: code,
    label: `${LOCALE_LABELS[code].flag}  ${LOCALE_LABELS[code].label}`,
  }));
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

  // Close when the Main Menu opens or the profile avatar is tapped.
  useExclusiveOverlay("quickaccess", () => setOpen(false));

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

  // Language switch from the profile menu — reachable by every user (the full
  // Settings shell is admin-only). Writes the durable per-user preference and
  // the gh-locale cookie, then refreshes so the UI re-renders in the language.
  async function changeLang(next: string) {
    const locale = next as Locale;
    setLang(locale);
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    try {
      await fetch("/api/user-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: locale }),
      });
    } catch {
      /* cookie already set — the choice still applies for this device */
    }
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
            <span className="flex w-5 shrink-0 justify-center opacity-70">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
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
            <span className="flex w-5 shrink-0 justify-center opacity-70">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><path d="M9 18V6l9-2v10" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6.5" cy="18" r="2.5" fill="currentColor" stroke="none" /><circle cx="15.5" cy="16" r="2.5" fill="currentColor" stroke="none" /></svg>
            </span>
            {t("uiSounds")}
          </span>
          <GpSwitch on={sounds} />
        </button>
        {sounds && (
          <div className="flex items-center gap-3 px-5 py-1.5">
            <span className="flex w-5 shrink-0 justify-center opacity-70">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]"><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15 9a3 3 0 0 1 0 6M17.5 6.5a6 6 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </span>
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
            <span className="flex w-5 shrink-0 justify-center opacity-70">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><path d="M9 17V4l11-2v13" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6.5" cy="17.5" r="2.5" fill="currentColor" stroke="none" /><circle cx="17.5" cy="15.5" r="2.5" fill="currentColor" stroke="none" /></svg>
            </span>
            {t("themeMusic")}
          </span>
          <GpSwitch on={themeMusic} />
        </button>

        {isAdmin && (
          <>
            <div className="px-5 pt-3 text-xs font-bold uppercase tracking-[0.25em] text-dim">{t("admin")}</div>
            <button onClick={scanNow} disabled={scanning} className="menu-item">
              <span className="flex w-5 shrink-0 justify-center opacity-70">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v3.6h-3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              {t("scanLibrary")}
            </button>
            {scanMsg && <div className="px-6 pb-2 text-xs text-body">{scanMsg}</div>}
            <Link href="/settings" onClick={() => setOpen(false)} className="menu-item">
              <span className="flex w-5 shrink-0 justify-center opacity-70">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[18px] w-[18px]"><circle cx="12" cy="12" r="3.2" /><path d="M12 3v2.5M12 18.5V21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M3 12h2.5M18.5 12H21M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" strokeLinecap="round" /></svg>
              </span>
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
            <span className="flex w-5 shrink-0 justify-center opacity-70">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]"><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0v1H4Z" /></svg>
            </span>
            {t("account")}
          </Link>
          <Link href="/account/friends" onClick={() => setOpen(false)} className="menu-item">
            <span className="flex w-5 shrink-0 justify-center opacity-70">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M2 19a6 6 0 0 1 12 0v1H2v-1Zm13-1a5 5 0 0 1 7 1v1h-6" /></svg>
            </span>
            {t("friends")}
          </Link>
          <div className="flex items-center justify-between gap-2 py-1 pl-5 pr-3">
            <span className="flex items-center gap-3 text-sm text-body">
              <span className="flex w-5 shrink-0 justify-center opacity-70">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[18px] w-[18px]"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.4 3.8 5.7 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.7-3.8-9s1.3-6.6 3.8-9Z" strokeLinejoin="round" /></svg>
              </span>
              {tLang("rowLabel")}
            </span>
            <GpDropdown value={lang} options={langOptions} onChange={changeLang} width={150} />
          </div>
          <button onClick={signOut} className="menu-item text-[#e0685f]">
            <span className="flex w-5 shrink-0 justify-center opacity-70">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><path d="M15 12H4m0 0 4-4m-4 4 4 4M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            {t("signOut")}
          </button>
        </div>
      </div>
    </div>
  );
}
