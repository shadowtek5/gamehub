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
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { SHADERS } from "@/lib/shaders";
import { GHome, GList, GFriends, GGear } from "@/components/menuGlyphs";

interface NavItem {
  key: string;
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  path: string;
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
  gameLogo,
  gameCover,
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
  onNavigate,
  onExit,
}: {
  open: boolean;
  romId: number;
  title: string;
  gameLogo?: string;
  gameCover?: string;
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
  onNavigate: (path: string) => void;
  onExit: () => void;
}) {
  const t = useTranslations("emulator");
  const tv = useTranslations("emuVideo");
  const [view, setView] = useState<"main" | "load" | "video" | "cheats">("main");
  const [slots, setSlots] = useState<StateSlot[] | null>(null);
  const [cheats, setCheats] = useState<CheatItem[] | null>(null);
  const [prebuilt, setPrebuilt] = useState<{ name: string; code: string }[]>([]);
  const [sel, setSel] = useState(0);
  // Two-column nav (Steam-style): the left "nav" column or the right "actions"
  // column is active for keyboard/controller focus.
  const [col, setCol] = useState<"nav" | "actions">("actions");
  const [navSel, setNavSel] = useState(0);

  // Left column: global destinations. Selecting one leaves the game entirely —
  // the Emulator saves the battery and hard-navigates so the emulation is killed
  // (no lingering game loop / audio in the background).
  const NAV: NavItem[] = [
    { key: "home", label: t("navHome"), Icon: GHome, path: "/" },
    { key: "library", label: t("navLibrary"), Icon: GList, path: "/library" },
    { key: "friends", label: t("navFriends"), Icon: GFriends, path: "/account" },
    { key: "settings", label: t("navSettings"), Icon: GGear, path: "/settings" },
  ];

  const activateNav = useCallback(
    (item: NavItem) => {
      onNavigate(item.path);
    },
    [onNavigate]
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
    <div
      className="absolute inset-0 z-30 flex items-stretch bg-black/55 pb-[42px] pt-10 backdrop-blur-[3px]"
      data-overlay="open"
    >
      {/* GameHub's real SystemBar (top) and LegendFooter (bottom) lift above the
          emulator while this menu is open — we inset by their heights (40/42px)
          so the columns sit cleanly between the real chrome. */}
      <div className="flex w-[min(94vw,540px)] bg-[#0e141b] shadow-[10px_0_50px_rgba(0,0,0,0.55)]">
        {/* Left column: running game + global destinations (Steam main menu).
            Measured off a real Deck: solid #0e141b, 48px rows, 24px left pad,
            18px/400 text, #b8bcbf idle / white active, #1a9fff select bar. */}
        <div className="flex w-[210px] shrink-0 flex-col bg-[#0e141b] py-1">
          <div className="flex h-12 items-center gap-2.5 truncate px-5 text-[18px] font-normal text-white">
            {gameCover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={gameCover} alt="" className="h-6 w-6 shrink-0 rounded-[3px] object-cover" />
            ) : null}
            <span className="truncate">{title}</span>
          </div>
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
                className={`relative flex h-12 items-center gap-3 pl-6 pr-4 text-left text-[18px] font-normal outline-none transition-colors ${
                  active ? "bg-[#23262e] text-white" : "text-[#b8bcbf] hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-[#1a9fff]" />}
                <n.Icon className="h-[19px] w-[19px] shrink-0" />
                <span className="truncate">{n.label}</span>
              </button>
            );
          })}
        </div>
        {/* Right column: the game actions (or an open sub-view). Base #0e141b
            plus the Deck's exact vertical gradient overlay. */}
        <div className="flex min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(148,179,245,0)_0%,rgba(52,70,78,0.624)_30%,rgba(9,14,17,0.42)_78%,rgba(179,179,179,0.18)_100%)]">
          {view !== "main" && (
            <div className="px-5 pb-2 pt-4 text-[12px] font-semibold uppercase tracking-[0.7px] text-white/40">
              {view === "load" ? t("loadState") : view === "video" ? t("videoFilter") : t("cheats")}
            </div>
          )}
          {view === "main" && (
            <div className="flex min-h-[72px] items-center justify-center px-6 pb-3 pt-5">
              {gameLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={gameLogo} alt={title} className="max-h-16 max-w-[85%] object-contain drop-shadow" />
              ) : (
                <span className="text-[19px] font-medium text-white">{title}</span>
              )}
            </div>
          )}
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
                  className={`relative flex h-11 w-full items-center pl-[18px] pr-4 text-left text-[16px] font-normal outline-none transition-colors ${
                    on ? "bg-[#23262e]" : "hover:bg-white/[0.04]"
                  } ${a.danger ? "text-[#e5776e]" : "text-white"}`}
                >
                  {on && <span className="absolute inset-y-0 left-0 w-[3px] bg-[#1a9fff]" />}
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
                  sel === 0 ? "bg-[#23262e]" : "hover:bg-white/[0.05]"
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
                      sel === i + 1 ? "bg-[#23262e]" : "hover:bg-white/[0.05]"
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
                  sel === 0 ? "bg-[#23262e]" : "hover:bg-white/[0.05]"
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
                        sel === i + 1 ? "bg-[#23262e]" : "hover:bg-white/[0.05]"
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
                          sel === idx ? "bg-[#23262e]" : "hover:bg-white/[0.05]"
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
                    sel === 0 ? "bg-[#23262e]" : "hover:bg-white/[0.05]"
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
                        sel === i + 1 ? "bg-[#23262e]" : "hover:bg-white/[0.05]"
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
        </div>
      </div>
      {/* Click-through-to-close area over the game */}
      <button className="flex-1 cursor-default" aria-label={t("resume")} onClick={onClose} />
    </div>
  );
}
