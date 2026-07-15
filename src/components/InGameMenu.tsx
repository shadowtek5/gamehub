"use client";

// Steam Deck-style Quick Menu that overlays the running game. Opened by the
// controller Select+Start combo, the Escape key, the F1 key, or the floating
// menu button. It's the single control surface for the game: EmulatorJS's own
// control bar is hidden for a clean interface, and this menu drives every
// action — our native ones (save/load state, screenshot, record, controller
// layout, restart, exit, video filter) plus EmulatorJS's own (pause,
// fast-forward, mute, fullscreen, cheats, netplay), which the Emulator triggers
// by clicking the hidden bar buttons. EmulatorJS actions only appear when the
// running core actually exposes them (detected from the hidden bar on open).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { SHADERS } from "@/lib/shaders";
import { GHome, GList, GFriends, GGear, GPower } from "@/components/menuGlyphs";

interface NavItem {
  key: string;
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  path: string | null; // null = exit the game
}

interface StateSlot {
  id: number;
  has_screenshot: number;
  created_at: string;
  label: string | null;
}

interface Action {
  key: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

interface CheatItem {
  id: number;
  name: string;
  code: string;
  enabled: number | boolean;
}

// Which EmulatorJS control-bar actions the running core exposes right now.
interface EmuCaps {
  pause: boolean;
  fastForward: boolean;
  mute: boolean;
  netplay: boolean;
}

// Detect a bar button by title/aria-label (the bar is hidden but still in DOM).
function ejsHas(match: RegExp): boolean {
  const mount = document.getElementById("ejs-mount");
  return [...(mount?.querySelectorAll<HTMLElement>(".ejs_menu_button") ?? [])].some((b) =>
    match.test((b.getAttribute("title") || b.getAttribute("aria-label") || "").toLowerCase())
  );
}

export default function InGameMenu({
  open,
  romId,
  title,
  recording = false,
  currentShader,
  onClose,
  onSaveState,
  onLoadState,
  onScreenshot,
  onControls,
  onRestart,
  onRecord,
  onTogglePause,
  onFastForward,
  onMute,
  onFullscreen,
  onNetplay,
  onSetShader,
  onApplyCheats,
  onExit,
}: {
  open: boolean;
  romId: number;
  title: string;
  recording?: boolean;
  currentShader?: string | null;
  onClose: () => void;
  onSaveState: () => void;
  onLoadState: (stateId: number) => void;
  onScreenshot: () => void;
  onControls: () => void;
  onRestart: () => void;
  onRecord: () => void;
  onTogglePause: () => void;
  onFastForward: () => void;
  onMute: () => void;
  onFullscreen: () => void;
  onNetplay: () => void;
  onSetShader: (shader: string) => void;
  onApplyCheats: (cheats: { code: string; enabled: number | boolean }[]) => void;
  onExit: () => void;
}) {
  const t = useTranslations("emulator");
  const tv = useTranslations("emuVideo");
  const router = useRouter();
  const [view, setView] = useState<"main" | "load" | "video" | "cheats">("main");
  const [slots, setSlots] = useState<StateSlot[] | null>(null);
  const [cheats, setCheats] = useState<CheatItem[] | null>(null);
  const [prebuilt, setPrebuilt] = useState<{ name: string; code: string }[]>([]);
  const [sel, setSel] = useState(0);
  // Two-column nav (Steam-style): the left "nav" column or the right "actions"
  // column is active for keyboard/controller focus.
  const [col, setCol] = useState<"nav" | "actions">("actions");
  const [navSel, setNavSel] = useState(0);

  // Left column: global destinations. A path navigates away (leaving the game);
  // null exits via the game's own save-and-exit.
  const NAV: NavItem[] = [
    { key: "home", label: t("navHome"), Icon: GHome, path: "/" },
    { key: "library", label: t("navLibrary"), Icon: GList, path: "/library" },
    { key: "friends", label: t("navFriends"), Icon: GFriends, path: "/account" },
    { key: "settings", label: t("navSettings"), Icon: GGear, path: "/settings" },
    { key: "power", label: t("navPower"), Icon: GPower, path: null },
  ];

  const activateNav = useCallback(
    (item: NavItem) => {
      if (item.path === null) {
        onExit();
        return;
      }
      onClose();
      router.push(item.path);
    },
    [onExit, onClose, router]
  );
  const [caps, setCaps] = useState<EmuCaps>({
    pause: false,
    fastForward: false,
    mute: false,
    netplay: false,
  });

  // Reset to the main view and re-detect available EmulatorJS actions on open.
  useEffect(() => {
    if (open) {
      setView("main");
      setSel(0);
      setCol("actions");
      setNavSel(0);
      setCaps({
        pause: ejsHas(/pause|play|resume/),
        fastForward: ejsHas(/fast.?forward/),
        mute: ejsHas(/mute|volume/),
        netplay: ejsHas(/netplay/),
      });
    }
  }, [open]);

  const openLoad = useCallback(async () => {
    setView("load");
    setSel(0);
    setSlots(null);
    try {
      const res = await fetch(`/api/roms/${romId}/states`, { cache: "no-store" });
      const data = await res.json();
      setSlots(data.states ?? []);
    } catch {
      setSlots([]);
    }
  }, [romId]);

  const openVideo = useCallback(() => {
    setView("video");
    setSel(0);
  }, []);

  const openCheats = useCallback(async () => {
    setView("cheats");
    setSel(0);
    setCheats(null);
    try {
      const res = await fetch(`/api/roms/${romId}/cheats`, { cache: "no-store" });
      const d = await res.json();
      setCheats(d.cheats ?? []);
      setPrebuilt(d.prebuilt ?? []);
    } catch {
      setCheats([]);
      setPrebuilt([]);
    }
  }, [romId]);

  // Prebuilt catalog entries the user hasn't added yet (compared by code).
  const addableCheats = prebuilt.filter(
    (p) => !(cheats ?? []).some((c) => c.code.toUpperCase() === p.code.toUpperCase())
  );

  const toggleCheat = useCallback(
    async (c: CheatItem) => {
      const enabled = c.enabled ? 0 : 1;
      const next = (cheats ?? []).map((x) => (x.id === c.id ? { ...x, enabled } : x));
      setCheats(next);
      onApplyCheats(next);
      try {
        await fetch(`/api/roms/${romId}/cheats`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: c.id, enabled: !!enabled }),
        });
      } catch {}
    },
    [cheats, romId, onApplyCheats]
  );

  const addPrebuilt = useCallback(
    async (p: { name: string; code: string }) => {
      try {
        const res = await fetch(`/api/roms/${romId}/cheats`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: p.name, code: p.code }),
        });
        const d = await res.json();
        if (d.cheat) {
          const next = [...(cheats ?? []), d.cheat as CheatItem];
          setCheats(next);
          onApplyCheats(next);
        }
      } catch {}
    },
    [cheats, romId, onApplyCheats]
  );

  const actions: Action[] = [
    { key: "resume", label: t("resume"), onSelect: onClose },
    ...(caps.pause ? [{ key: "pause", label: t("pause"), onSelect: () => { onTogglePause(); onClose(); } }] : []),
    ...(caps.fastForward ? [{ key: "ff", label: t("fastForward"), onSelect: () => { onFastForward(); onClose(); } }] : []),
    { key: "save", label: t("saveState"), onSelect: () => { onSaveState(); onClose(); } },
    { key: "load", label: t("loadState"), onSelect: () => void openLoad() },
    { key: "shot", label: t("screenshot"), onSelect: () => { onScreenshot(); onClose(); } },
    { key: "record", label: recording ? t("stopRecording") : t("recordClip"), onSelect: () => { onRecord(); onClose(); } },
    { key: "video", label: t("videoFilter"), onSelect: openVideo },
    ...(caps.mute ? [{ key: "mute", label: t("mute"), onSelect: () => { onMute(); onClose(); } }] : []),
    { key: "fullscreen", label: t("fullscreen"), onSelect: () => { onFullscreen(); onClose(); } },
    { key: "cheats", label: t("cheats"), onSelect: openCheats },
    ...(caps.netplay ? [{ key: "netplay", label: t("netplay"), onSelect: () => { onNetplay(); onClose(); } }] : []),
    { key: "controls", label: t("controllerLayout"), onSelect: () => { onControls(); onClose(); } },
    { key: "restart", label: t("restart"), onSelect: () => { onRestart(); onClose(); } },
    { key: "exit", label: t("exitGame"), onSelect: onExit, danger: true },
  ];

  // Count of navigable rows in the current view (sub-views add a Back row at 0).
  const loadRows = (slots?.length ?? 0) + 1;
  const videoRows = SHADERS.length + 1;
  const cheatRows = 1 + (cheats?.length ?? 0) + addableCheats.length;
  const count =
    view === "main"
      ? actions.length
      : view === "load"
        ? loadRows
        : view === "video"
          ? videoRows
          : cheatRows;

  const activate = useCallback(
    (index: number) => {
      if (view === "main") {
        actions[index]?.onSelect();
        return;
      }
      // Load / Video views: index 0 is the Back row.
      if (index === 0) {
        setView("main");
        setSel(0);
        return;
      }
      if (view === "load") {
        const slot = slots?.[index - 1];
        if (slot) {
          onLoadState(slot.id);
          onClose();
        }
      } else if (view === "video") {
        const shader = SHADERS[index - 1];
        if (shader) {
          onSetShader(shader.value);
          onClose();
        }
      } else {
        // Cheats view: [saved cheats…][addable prebuilt…]. Stays open so the
        // user can toggle/add several in a row.
        const nUser = cheats?.length ?? 0;
        if (index - 1 < nUser) {
          const c = cheats?.[index - 1];
          if (c) void toggleCheat(c);
        } else {
          const p = addableCheats[index - 1 - nUser];
          if (p) void addPrebuilt(p);
        }
      }
    },
    [view, actions, slots, cheats, addableCheats, toggleCheat, addPrebuilt, onLoadState, onSetShader, onClose]
  );

  // Keyboard (and, via the Emulator's gamepad bridge, controller) navigation.
  // Left/Right switch between the nav column and the actions column (only on the
  // main view; sub-views take over the actions column and ignore column moves).
  const navActive = view === "main" && col === "nav";
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const rows = navActive ? NAV.length : count;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        (navActive ? setNavSel : setSel)((s) => (s + 1) % Math.max(1, rows));
        playSound("navigate");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        (navActive ? setNavSel : setSel)((s) => (s - 1 + Math.max(1, rows)) % Math.max(1, rows));
        playSound("navigate");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (view === "main" && col === "actions") { setCol("nav"); playSound("navigate"); }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (view === "main" && col === "nav") { setCol("actions"); playSound("navigate"); }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (navActive) activateNav(NAV[navSel]);
        else activate(sel);
      } else if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        if (view !== "main") { setView("main"); setSel(0); }
        else if (col === "nav") setCol("actions");
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, count, sel, navSel, activate, activateNav, NAV, navActive, col, view, onClose]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-stretch bg-black/55 backdrop-blur-[3px]" data-overlay="open">
      {/* Left panel — Steam Deck "STEAM MENU" style: dark vertical-gradient
          column, icon-free text list, A/B glyph bar along the bottom. */}
      <div className="flex w-[min(94vw,470px)] bg-[linear-gradient(180deg,#15171c_0%,#262b34_50%,#15171c_100%)] shadow-[10px_0_50px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06]">
        {/* Left column: game title + global destinations (Steam nav). */}
        <div className="flex w-[150px] shrink-0 flex-col border-r border-white/[0.06] py-2">
          <div className="truncate px-4 pb-3 pt-2.5 text-[14px] font-bold text-white/90">{title}</div>
          {NAV.map((n, i) => {
            const active = view === "main" && col === "nav" && navSel === i;
            return (
              <button
                key={n.key}
                onMouseEnter={() => {
                  setCol("nav");
                  setNavSel(i);
                }}
                onClick={() => activateNav(n)}
                className={`mx-2 flex items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-[14px] outline-none transition-colors ${
                  active
                    ? "bg-gradient-to-r from-white/[0.13] to-white/[0.04] text-white"
                    : "text-white/55 hover:bg-white/[0.05] hover:text-white/90"
                }`}
              >
                <n.Icon className="h-[17px] w-[17px] shrink-0" />
                <span className="truncate">{n.label}</span>
              </button>
            );
          })}
        </div>
        {/* Right column: the game actions (or an open sub-view). */}
        <div className="flex min-w-0 flex-1 flex-col">
          {view !== "main" && (
            <div className="px-5 pb-2 pt-4 text-[12px] font-semibold uppercase tracking-[0.7px] text-white/40">
              {view === "load" ? t("loadState") : view === "video" ? t("videoFilter") : t("cheats")}
            </div>
          )}
          {view === "main" && <div className="pt-2" />}
        <div className="flex-1 overflow-y-auto pb-2">
          {view === "main" ? (
            actions.map((a, i) => {
              const on = col === "actions" && sel === i;
              return (
                <button
                  key={a.key}
                  onMouseEnter={() => {
                    setCol("actions");
                    setSel(i);
                  }}
                  onClick={() => activate(i)}
                  className={`mx-2 flex w-[calc(100%-16px)] items-center rounded-[6px] px-4 py-2.5 text-left text-[16px] font-medium outline-none transition-colors ${
                    on ? "bg-gradient-to-r from-white/[0.13] to-white/[0.04]" : "hover:bg-white/[0.05]"
                  } ${a.danger ? "text-[#e5776e]" : on ? "text-white" : "text-white/70"}`}
                >
                  {a.label}
                </button>
              );
            })
          ) : view === "video" ? (
            <>
              <button
                onMouseEnter={() => setSel(0)}
                onClick={() => activate(0)}
                className={`flex w-full items-center px-5 py-2.5 text-left text-[13px] font-semibold text-dim outline-none ${
                  sel === 0 ? "bg-gradient-to-r from-white/[0.13] to-white/[0.04]" : "hover:bg-white/[0.05]"
                }`}
              >
                ‹ {t("back")}
              </button>
              {SHADERS.map((s, i) => {
                const active = (currentShader ?? "disabled") === s.value;
                return (
                  <button
                    key={s.value}
                    onMouseEnter={() => setSel(i + 1)}
                    onClick={() => activate(i + 1)}
                    className={`flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-[14px] font-semibold outline-none ${
                      sel === i + 1 ? "bg-gradient-to-r from-white/[0.13] to-white/[0.04]" : "hover:bg-white/[0.05]"
                    } ${active ? "text-accent" : "text-body"}`}
                  >
                    <span>{s.key ? tv(s.key) : s.label ?? s.value}</span>
                    {active && <span className="text-[13px]">✓</span>}
                  </button>
                );
              })}
            </>
          ) : view === "cheats" ? (
            <>
              <button
                onMouseEnter={() => setSel(0)}
                onClick={() => activate(0)}
                className={`flex w-full items-center px-5 py-2.5 text-left text-[13px] font-semibold text-dim outline-none ${
                  sel === 0 ? "bg-gradient-to-r from-white/[0.13] to-white/[0.04]" : "hover:bg-white/[0.05]"
                }`}
              >
                ‹ {t("back")}
              </button>
              {cheats === null ? (
                <div className="px-5 py-4 text-[13px] text-dim">{t("loadingCheats")}</div>
              ) : (
                <>
                  {cheats.length === 0 && addableCheats.length === 0 ? (
                    <div className="px-5 py-4 text-[13px] leading-relaxed text-dim">
                      {t("noCheats")}
                    </div>
                  ) : null}
                  {cheats.map((c, i) => (
                    <button
                      key={c.id}
                      onMouseEnter={() => setSel(i + 1)}
                      onClick={() => activate(i + 1)}
                      className={`flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-[14px] font-semibold outline-none ${
                        sel === i + 1 ? "bg-gradient-to-r from-white/[0.13] to-white/[0.04]" : "hover:bg-white/[0.05]"
                      } ${c.enabled ? "text-accent" : "text-body"}`}
                    >
                      <span className="min-w-0 truncate">{c.name}</span>
                      <span className="shrink-0 text-[12px] text-dim">{c.enabled ? t("cheatOn") : t("cheatOff")}</span>
                    </button>
                  ))}
                  {addableCheats.length > 0 && (
                    <div className="px-5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-dim">
                      {t("cheatsFromList")}
                    </div>
                  )}
                  {addableCheats.map((p, j) => {
                    const idx = (cheats?.length ?? 0) + 1 + j;
                    return (
                      <button
                        key={`${p.code}-${j}`}
                        onMouseEnter={() => setSel(idx)}
                        onClick={() => activate(idx)}
                        className={`flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-[14px] font-semibold text-body outline-none ${
                          sel === idx ? "bg-gradient-to-r from-white/[0.13] to-white/[0.04]" : "hover:bg-white/[0.05]"
                        }`}
                      >
                        <span className="min-w-0 truncate">{p.name}</span>
                        <span className="shrink-0 text-[16px] leading-none text-dim">＋</span>
                      </button>
                    );
                  })}
                </>
              )}
            </>
          ) : (
              <>
                <button
                  onMouseEnter={() => setSel(0)}
                  onClick={() => activate(0)}
                  className={`flex w-full items-center px-5 py-2.5 text-left text-[13px] font-semibold text-dim outline-none ${
                    sel === 0 ? "bg-gradient-to-r from-white/[0.13] to-white/[0.04]" : "hover:bg-white/[0.05]"
                  }`}
                >
                  ‹ {t("back")}
                </button>
                {slots === null ? (
                  <div className="px-5 py-4 text-[13px] text-dim">{t("loadingStates")}</div>
                ) : slots.length === 0 ? (
                  <div className="px-5 py-4 text-[13px] text-dim">{t("noSavedStates")}</div>
                ) : (
                  slots.map((s, i) => (
                    <button
                      key={s.id}
                      onMouseEnter={() => setSel(i + 1)}
                      onClick={() => activate(i + 1)}
                      className={`flex w-full items-center gap-3 px-5 py-2 text-left outline-none ${
                        sel === i + 1 ? "bg-gradient-to-r from-white/[0.13] to-white/[0.04]" : "hover:bg-white/[0.05]"
                      }`}
                    >
                      {s.has_screenshot ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/states/${s.id}?type=screenshot`}
                          alt=""
                          className="h-10 w-14 shrink-0 rounded-[3px] bg-black object-cover"
                        />
                      ) : (
                        <span className="h-10 w-14 shrink-0 rounded-[3px] bg-black/50" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-body">
                          {s.label || t("stateSlot", { date: s.created_at.slice(0, 16).replace("T", " ") })}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </>
            )}
        </div>
        {/* Steam-style action bar: MENU pill on the left, A/B button glyphs. */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-3">
          <span className="rounded bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.6px] text-white/75">
            {t("menuLabel")}
          </span>
          <div className="flex items-center gap-4 text-[12px] font-medium text-white/70">
            <span className="flex items-center gap-1.5">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-black">A</span>
              {t("selectLabel")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-black">B</span>
              {t("back")}
            </span>
          </div>
        </div>
        </div>
      </div>
      {/* Click-through-to-close area over the game */}
      <button className="flex-1 cursor-default" aria-label={t("resume")} onClick={onClose} />
    </div>
  );
}
