"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import ControllerLayout, { LAYOUT_EVENT } from "@/components/ControllerLayout";
import {
  defaultLayout,
  detectFamily,
  layoutToIndexMap,
  type ConsoleButton,
  type ControllerFamily,
} from "@/lib/controllerLayout";
import { rewindEnabled } from "@/lib/playPrefs";

const EJS_CDN = "https://cdn.emulatorjs.org/stable/data/";

interface EjsSavePayload {
  state: Uint8Array;
  screenshot?: Uint8Array;
}

declare global {
  interface Window {
    EJS_player?: string;
    EJS_core?: string;
    EJS_gameUrl?: string;
    EJS_gameName?: string;
    EJS_biosUrl?: string;
    EJS_pathtodata?: string;
    EJS_startOnLoaded?: boolean;
    EJS_backgroundColor?: string;
    EJS_defaultControls?: unknown;
    /** EmulatorJS default settings (rewind, shaders, …) applied at boot. */
    EJS_defaultOptions?: Record<string, unknown>;
    /** Toggle EmulatorJS's built-in control-bar buttons on/off by key. */
    EJS_Buttons?: Record<string, boolean>;
    EJS_onSaveState?: (payload: EjsSavePayload) => void;
    EJS_onLoadState?: () => void;
    EJS_onGameStart?: () => void;
    /** set once we've patched getContext for canvas screenshots */
    __ghGlPatched?: boolean;
    EJS_emulator?: {
      gameManager?: {
        loadState?: (data: Uint8Array) => void;
        /** display metrics; "aspect" is the core's display ratio (4:3 ≈ 1.333) */
        getVideoDimensions?: (which: "aspect" | "width" | "height") => number;
        getSaveFilePath?: () => string;
        getSaveFile?: () => Uint8Array | null;
        saveSaveFiles?: () => void;
        loadSaveFiles?: () => void;
        FS?: {
          writeFile: (path: string, data: Uint8Array) => void;
          readFile?: (path: string) => Uint8Array;
          mkdirTree?: (path: string) => void;
          analyzePath?: (path: string) => { exists: boolean };
        };
      };
      displayMessage?: (msg: string) => void;
    };
  }
}

// ---- gamepad -> keyboard bridge -------------------------------------------
// EmulatorJS's native gamepad support assumes the browser's "standard"
// mapping, which many pads (8BitDo in D-input/Switch mode, generic retro
// pads) don't provide. Instead we pin EJS to known keyboard bindings and
// translate ANY pad — hat-switch d-pads, sticks, odd button indices — into
// synthetic key events, using the same tolerant reading as the app UI.

// Console (RetroPad) button -> the keyboard key EmulatorJS is pinned to (see
// EJS_CONTROLS). Directions are fixed to movement; the rest are what a layout
// can target. Keys must stay unique and mirror EJS_CONTROLS exactly.
const KEYS = {
  up: { key: "ArrowUp", code: 38 },
  down: { key: "ArrowDown", code: 40 },
  left: { key: "ArrowLeft", code: 37 },
  right: { key: "ArrowRight", code: 39 },
  b: { key: "z", code: 90 },
  a: { key: "x", code: 88 },
  y: { key: "a", code: 65 },
  x: { key: "s", code: 83 },
  l: { key: "q", code: 81 },
  r: { key: "e", code: 69 },
  l2: { key: "t", code: 84 },
  r2: { key: "g", code: 71 },
  l3: { key: "f", code: 70 },
  r3: { key: "h", code: 72 },
  select: { key: "v", code: 86 },
  start: { key: "Enter", code: 13 },
} as const;

type ConsoleKey = keyof typeof KEYS;
/** The direction keys, which stay fixed to movement and aren't remappable. */
type Direction = "up" | "down" | "left" | "right";

/** Grab a PNG thumbnail from the emulator's canvas — used as the save-state
 *  screenshot when EmulatorJS doesn't hand us one. Relies on the getContext
 *  patch (preserveDrawingBuffer) so the WebGL buffer isn't blank. */
function captureCanvasShot(): Promise<Blob | null> {
  const canvas = document.querySelector<HTMLCanvasElement>("#ejs-mount canvas");
  if (!canvas || !canvas.width || !canvas.height) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/png");
    } catch {
      resolve(null);
    }
  });
}

// EJS control ids (libretro RetroPad): 0=B 1=Y 2=SELECT 3=START 4..7=dpad
// 8=A 9=X 10=L 11=R 12=L2 13=R2 14=L3 15=R3. Values mirror KEYS above.
const EJS_CONTROLS = {
  0: {
    0: { value: "z" },
    1: { value: "a" },
    2: { value: "v" },
    3: { value: "enter" },
    4: { value: "up arrow" },
    5: { value: "down arrow" },
    6: { value: "left arrow" },
    7: { value: "right arrow" },
    8: { value: "x" },
    9: { value: "s" },
    10: { value: "q" },
    11: { value: "e" },
    12: { value: "t" },
    13: { value: "g" },
    14: { value: "f" },
    15: { value: "h" },
  },
  1: {},
  2: {},
  3: {},
};

const HAT: [number, Direction[]][] = [
  [-1, ["up"]],
  [-5 / 7, ["up", "right"]],
  [-3 / 7, ["right"]],
  [-1 / 7, ["down", "right"]],
  [1 / 7, ["down"]],
  [3 / 7, ["down", "left"]],
  [5 / 7, ["left"]],
  [1, ["up", "left"]],
];

const NO_KEYS: Record<ConsoleKey, boolean> = {
  up: false, down: false, left: false, right: false,
  b: false, a: false, y: false, x: false,
  l: false, r: false, l2: false, r2: false, l3: false, r3: false,
  select: false, start: false,
};

/** Directions are never remappable — read the D-Pad, left stick, and any
 *  hat-encoded axis (retro D-input pads), exactly as before. */
function readDirections(pad: Gamepad, trustedHats: Set<string>): Record<Direction, boolean> {
  const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
  const state: Record<Direction, boolean> = { up: false, down: false, left: false, right: false };
  if (btn(12)) state.up = true;
  if (btn(13)) state.down = true;
  if (btn(14)) state.left = true;
  if (btn(15)) state.right = true;
  const ax0 = pad.axes[0] ?? 0;
  const ax1 = pad.axes[1] ?? 0;
  if (ax1 < -0.5) state.up = true;
  if (ax1 > 0.5) state.down = true;
  if (ax0 < -0.5) state.left = true;
  if (ax0 > 0.5) state.right = true;
  for (let i = 2; i < pad.axes.length; i++) {
    const v = pad.axes[i];
    if (typeof v !== "number") continue;
    const key = `${pad.index}:${i}`;
    if (Math.abs(v) > 1.02) {
      trustedHats.add(key);
      continue;
    }
    if (!trustedHats.has(key)) continue;
    for (const [hv, dirs] of HAT) {
      if (Math.abs(v - hv) < 0.03) {
        for (const d of dirs) state[d] = true;
        break;
      }
    }
  }
  return state;
}

/** Fallback for non-standard pads (indices don't match the Gamepad spec):
 *  the tolerant fixed reading GameHub always used. */
function readButtonsHeuristic(pad: Gamepad, out: Record<ConsoleKey, boolean>) {
  const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
  if (btn(0)) out.b = true;
  if (btn(1)) out.a = true;
  if (btn(2)) out.y = true;
  if (btn(3)) out.x = true;
  if (btn(4)) out.l = true;
  if (btn(5)) out.r = true;
  if (btn(6)) out.l2 = true;
  if (btn(7)) out.r2 = true;
  if (btn(10)) out.l3 = true;
  if (btn(11)) out.r3 = true;
  if (btn(8)) out.select = true;
  if (btn(9) || btn(16)) out.start = true;
}

function sendKey(target: EventTarget, type: "keydown" | "keyup", key: string, code: number) {
  const ev = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
  Object.defineProperty(ev, "keyCode", { get: () => code });
  Object.defineProperty(ev, "which", { get: () => code });
  target.dispatchEvent(ev);
}

async function loadStateData(
  data: ArrayBuffer,
  label: string,
  notify: (msg: string, kind?: "info" | "error") => void
) {
  try {
    window.EJS_emulator?.gameManager?.loadState?.(new Uint8Array(data));
    notify(label);
  } catch {
    notify("Failed to load state", "error");
  }
}

/**
 * EmulatorJS runs retro cores compiled to WebAssembly, loaded from its CDN.
 * Save states go to the GameHub server (per user, per game) — the player's
 * Save/Load State buttons round-trip through /api/roms/[id]/states, and
 * /play/[id]?state=<id> resumes a specific state.
 */
export default function Emulator({
  romId,
  title,
  core,
  platformName,
  platformSlug,
  resumeStateId,
  biosUrl,
}: {
  romId: number;
  title: string;
  core: string;
  platformName: string;
  /** System slug — resolves the per-system controller layout override */
  platformSlug: string;
  resumeStateId?: number;
  /** Zip of the platform's firmware (from Settings → Firmware), if any */
  biosUrl?: string;
}) {
  const t = useTranslations("emulator");
  const started = useRef(false);
  // Centered loading / error state (our shell's own overlay, not EJS's default).
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [err, setErr] = useState("");
  const readyRef = useRef(false);
  // Bezel hugs the game: size the frame to the core's real display aspect
  // (4:3, 16:9, …) once known, fitted to the viewport. Null until the game
  // starts (frame fills the area while loading).
  const areaRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  // Steam-style toasts (replace EmulatorJS's own .ejs_message notifications).
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: "info" | "error" }[]>([]);
  const toastId = useRef(0);
  // EmulatorJS's real download/decompress progress, mirrored from its (hidden)
  // loading text into our centered overlay, with a parsed percentage for a bar.
  const [progressText, setProgressText] = useState("");
  const [progressPct, setProgressPct] = useState<number | null>(null);
  // In-emulator controller-layout editor (opened from the menu-bar button).
  const [showControls, setShowControls] = useState(false);
  // Resolved physical-button-index -> console button map for the connected pad,
  // rebuilt when the pad (family) changes or a layout is saved. Seeded with the
  // default so keyboard + standard pads work before the fetch lands.
  const layoutRef = useRef<Map<number, Exclude<ConsoleButton, "none">>>(
    layoutToIndexMap(defaultLayout("xinput"))
  );
  const familyRef = useRef<ControllerFamily>("xinput");
  const dismissToast = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const pushToast = (msg: string, kind: "info" | "error" = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    // Info notices are transient (Steam-style, auto-clear after 4s); errors
    // linger until the player dismisses them.
    if (kind === "info") setTimeout(() => dismissToast(id), 4000);
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // EmulatorJS draws through a WebGL canvas whose buffer is cleared after
    // each frame, so canvas.toBlob() reads black unless preserveDrawingBuffer
    // is on. Patch getContext BEFORE EJS creates its canvas so we can grab a
    // save-state thumbnail from it (fallback when EJS gives us no screenshot).
    if (!window.__ghGlPatched) {
      window.__ghGlPatched = true;
      const proto = HTMLCanvasElement.prototype as unknown as {
        getContext: (type: string, attrs?: Record<string, unknown>) => unknown;
      };
      const orig = proto.getContext;
      proto.getContext = function (this: HTMLCanvasElement, type: string, attrs?: Record<string, unknown>) {
        if (typeof type === "string" && type.indexOf("webgl") === 0) {
          attrs = { ...(attrs ?? {}), preserveDrawingBuffer: true };
        }
        return orig.call(this, type, attrs);
      };
    }

    window.EJS_player = "#ejs-mount";
    window.EJS_core = core;
    window.EJS_gameUrl = `/api/roms/${romId}/file`;
    window.EJS_gameName = title;
    window.EJS_pathtodata = EJS_CDN;
    window.EJS_startOnLoaded = true;
    window.EJS_backgroundColor = "#0e1116";
    window.EJS_defaultControls = EJS_CONTROLS;
    // Hide EmulatorJS's built-in controller-mapping button — GameHub's own
    // controller-layout editor (gh-controls-btn) supersedes it.
    window.EJS_Buttons = { ...(window.EJS_Buttons ?? {}), gamepad: false };
    // Rewind is opt-in per device (Settings → Controller → Gameplay) — it costs
    // extra memory/CPU, so we only allocate its buffer when the player enabled it.
    window.EJS_defaultOptions = {
      ...(window.EJS_defaultOptions ?? {}),
      rewindEnabled: rewindEnabled() ? "enabled" : "disabled",
    };
    if (biosUrl) window.EJS_biosUrl = biosUrl;

    // Save State button -> upload to GameHub, with a thumbnail. Prefer EJS's
    // own screenshot; if it doesn't provide one, capture the emulator canvas so
    // every state still gets a picture for the Saves & states cards.
    window.EJS_onSaveState = async (payload) => {
      const form = new FormData();
      form.append("state", new Blob([payload.state as BlobPart]), "save.state");
      let shot: Blob | null = payload.screenshot
        ? new Blob([payload.screenshot as BlobPart], { type: "image/png" })
        : null;
      if (!shot) shot = await captureCanvasShot();
      if (shot) form.append("screenshot", shot, "shot.png");
      fetch(`/api/roms/${romId}/states`, { method: "POST", body: form })
        .then((res) => {
          if (res.ok) pushToast(t("stateSaved"));
          else pushToast(t("saveFailed"), "error");
        })
        .catch(() => pushToast(t("saveFailed"), "error"));
    };

    // Load State button -> most recent server state
    window.EJS_onLoadState = () => {
      fetch(`/api/roms/${romId}/states`)
        .then((r) => r.json())
        .then(async (data) => {
          const latest = data.states?.[0];
          if (!latest) {
            pushToast(t("noSavedStates"));
            return;
          }
          const file = await fetch(`/api/states/${latest.id}`);
          if (!file.ok) throw new Error();
          await loadStateData(await file.arrayBuffer(), t("stateLoaded"), pushToast);
        })
        .catch(() => pushToast(t("loadFailed"), "error"));
    };

    // On start: load the server-side battery save, then (optionally) resume
    // a specific state when launched via "Resume" on the game page
    window.EJS_onGameStart = () => {
      readyRef.current = true;
      setPhase("ready");
      injectBar();
      // Read the core's real display aspect (retry briefly until gameManager is
      // ready) so the frame can hug the game.
      let aTries = 0;
      const readAspect = () => {
        const a = window.EJS_emulator?.gameManager?.getVideoDimensions?.("aspect");
        if (typeof a === "number" && a > 0.2 && a < 5) {
          setAspect(a);
        } else if (aTries++ < 12) {
          setTimeout(readAspect, 300);
        } else {
          setAspect(4 / 3); // sensible default
        }
      };
      readAspect();
      setTimeout(async () => {
        await pullBatterySave();
        if (resumeStateId) {
          try {
            const file = await fetch(`/api/states/${resumeStateId}`);
            if (file.ok) await loadStateData(await file.arrayBuffer(), t("resumedSaveState"), pushToast);
          } catch {}
        }
      }, 400);
    };

    const script = document.createElement("script");
    script.src = `${EJS_CDN}loader.js`;
    script.onerror = () => {
      setErr(t("loadEmulatorError"));
      setPhase("error");
    };
    document.body.appendChild(script);

    // Catch-all: if the game never starts (bad ROM/BIOS, stalled download),
    // surface a centered error with Retry instead of an endless spinner.
    const loadTimeout = setTimeout(() => {
      if (!readyRef.current) {
        setErr(t("loadTimeoutError"));
        setPhase("error");
      }
    }, 90_000);

    // Resolve this user's controller layout for the connected pad's family,
    // this system, and this game (game > system > global[family] > default) and
    // cache the physical-index -> console-button map.
    async function loadLayout(family: ControllerFamily) {
      try {
        const q = new URLSearchParams({ family, slug: platformSlug, romId: String(romId) });
        const res = await fetch(`/api/account/controller-layout?${q.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        layoutRef.current = layoutToIndexMap(data.resolved);
      } catch {}
    }
    // Re-resolve when a layout is saved in the in-emulator editor.
    const onLayoutChange = () => void loadLayout(familyRef.current);
    window.addEventListener(LAYOUT_EVENT, onLayoutChange);

    // Gamepad -> keyboard bridge: poll the pad, dispatch key events at the
    // emulator mount so EJS's keyboard bindings drive the game. Directions are
    // fixed; buttons follow the resolved layout (standard pads) or the built-in
    // heuristic (non-standard pads).
    const trustedHats = new Set<string>();
    let lastPadId = "";
    const prev: Record<ConsoleKey, boolean> = { ...NO_KEYS };
    let raf = 0;
    function pollPad() {
      try {
        const target = document.getElementById("ejs-mount") ?? document.body;
        const now: Record<ConsoleKey, boolean> = { ...NO_KEYS };
        for (const pad of navigator.getGamepads?.() ?? []) {
          if (!pad) continue;
          // New pad → detect family and (re)load its layout.
          if (pad.id !== lastPadId) {
            lastPadId = pad.id;
            const fam = detectFamily(pad.id);
            familyRef.current = fam;
            void loadLayout(fam);
          }
          const dirs = readDirections(pad, trustedHats);
          now.up ||= dirs.up;
          now.down ||= dirs.down;
          now.left ||= dirs.left;
          now.right ||= dirs.right;
          if (pad.mapping === "standard") {
            for (const [idx, ck] of layoutRef.current) {
              if (pad.buttons[idx]?.pressed) now[ck] = true;
            }
          } else {
            readButtonsHeuristic(pad, now);
          }
        }
        for (const action of Object.keys(now) as ConsoleKey[]) {
          if (now[action] !== prev[action]) {
            const { key, code } = KEYS[action];
            sendKey(target, now[action] ? "keydown" : "keyup", key, code);
            prev[action] = now[action];
          }
        }
      } catch {}
      raf = requestAnimationFrame(pollPad);
    }
    raf = requestAnimationFrame(pollPad);

    // Inject an "Exit" button at the far left of EmulatorJS's own control bar
    // (there's no GameHub header anymore). The bar is built after the game
    // starts, so watch the mount for it.
    const EXIT_SVG =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><path d="M14 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7"/><path d="M11 12h9m0 0-3.5-3.5M20 12l-3.5 3.5"/></svg>';
    const CONTROLS_SVG =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/></svg>';
    const injectBar = (): boolean => {
      const mount = document.getElementById("ejs-mount");
      const bar = mount?.querySelector(".ejs_menu_bar");
      if (!bar) return false;
      if (bar.querySelector(".gh-exit-btn")) return true;
      const mk = (cls: string, svg: string, label: string, onClick: () => void) => {
        const btn = document.createElement("button");
        btn.className = `ejs_menu_button ${cls}`;
        btn.title = label;
        btn.setAttribute("aria-label", label);
        btn.style.cssText =
          "display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;order:-1;";
        btn.innerHTML = svg;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          onClick();
        });
        return btn;
      };
      // Controls first, then Exit — both pinned to the far left (order:-1).
      const controls = mk("gh-controls-btn", CONTROLS_SVG, t("controllerLayout"), () =>
        setShowControls(true)
      );
      const exitBtn = mk("gh-exit-btn", EXIT_SVG, t("exitToGame"), () => void exit());
      bar.insertBefore(controls, bar.firstChild);
      bar.insertBefore(exitBtn, bar.firstChild);
      // Fallback in case EJS_Buttons.gamepad didn't take: hide EmulatorJS's own
      // control-settings button by title (never our injected gh- buttons).
      bar.querySelectorAll<HTMLElement>(".ejs_menu_button").forEach((b) => {
        if (b.classList.contains("gh-controls-btn") || b.classList.contains("gh-exit-btn")) return;
        const t = (b.getAttribute("title") || b.getAttribute("aria-label") || "").toLowerCase();
        if (t.includes("control settings")) b.style.display = "none";
      });
      return true;
    };
    const exitObserver = new MutationObserver(() => {
      if (injectBar()) exitObserver.disconnect();
    });
    exitObserver.observe(document.getElementById("ejs-mount") ?? document.body, {
      childList: true,
      subtree: true,
    });

    // Mirror EmulatorJS's own loading text (which we hide) into our overlay so
    // the user sees real progress — "Download Game Core 45%", decompress, etc.
    const loadObserver = new MutationObserver(() => {
      const el = document.querySelector("#ejs-mount .ejs_loading_text");
      const txt = el?.textContent?.trim();
      if (!txt) return;
      // EmulatorJS's startGameError() puts the real failure reason here and tags
      // it .ejs_error_text (e.g. "This core requires threads…"). Surface it in our
      // error card immediately instead of spinning until the timeout.
      if (el?.classList.contains("ejs_error_text")) {
        readyRef.current = true; // stop the load timeout from firing too
        setErr(txt);
        setPhase("error");
        return;
      }
      setProgressText(txt);
      const m = txt.match(/(\d+)\s*%/);
      setProgressPct(m ? Math.min(100, Number(m[1])) : null);
    });
    loadObserver.observe(document.getElementById("ejs-mount") ?? document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Keep EmulatorJS sized to the frame as the browser resizes: nudge its
    // window-resize handler whenever the mount's box changes.
    let resizeRaf = 0;
    const mountEl = document.getElementById("ejs-mount");
    const resizeObs = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    });
    if (mountEl) resizeObs.observe(mountEl);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetch(`/api/roms/${romId}/heartbeat`, { method: "POST" }).catch(() => {});
      }
    }, 60_000);
    // Push the battery save every 2 minutes while playing
    const saveInterval = setInterval(() => {
      if (document.visibilityState === "visible") void pushBatterySave();
    }, 120_000);
    return () => {
      clearInterval(interval);
      clearInterval(saveInterval);
      clearTimeout(loadTimeout);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeRaf);
      exitObserver.disconnect();
      loadObserver.disconnect();
      resizeObs.disconnect();
      window.removeEventListener(LAYOUT_EVENT, onLayoutChange);
    };
  }, [romId, title, core, platformSlug, resumeStateId, biosUrl]);

  // Fit the frame to the game's display aspect, recomputed as the viewport
  // resizes. ResizeObserver fires an initial callback on observe(), so the
  // frame is sized as soon as the aspect is known.
  useEffect(() => {
    const el = areaRef.current;
    if (!aspect || !el) return;
    const ro = new ResizeObserver(() => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      let w = cw;
      let h = cw / aspect;
      if (h > ch) {
        h = ch;
        w = ch * aspect;
      }
      setFrameSize({ w: Math.round(w), h: Math.round(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  // ---- battery save (.srm) sync: load on start, push on exit + interval ----
  async function pullBatterySave() {
    try {
      const res = await fetch(`/api/roms/${romId}/save`);
      if (!res.ok) return;
      const data = new Uint8Array(await res.arrayBuffer());
      const gm = window.EJS_emulator?.gameManager;
      const path = gm?.getSaveFilePath?.();
      if (!gm?.FS || !path || data.length === 0) return;
      const dir = path.split("/").slice(0, -1).join("/");
      try {
        gm.FS.mkdirTree?.(dir);
      } catch {}
      gm.FS.writeFile(path, data);
      gm.loadSaveFiles?.();
      pushToast(t("batterySaveLoaded"));
    } catch {}
  }

  async function pushBatterySave(): Promise<boolean> {
    try {
      const gm = window.EJS_emulator?.gameManager;
      if (!gm) return false;
      // flush the core's in-memory SRAM to the emulator FS, then read the
      // .srm straight from that path — EmulatorJS has no getSaveFile(), so the
      // FS is the source of truth (the old getSaveFile guard never passed).
      gm.saveSaveFiles?.();
      let data: Uint8Array | null = null;
      const path = gm.getSaveFilePath?.();
      if (gm.FS?.readFile && path) {
        try {
          if (!gm.FS.analyzePath || gm.FS.analyzePath(path).exists) {
            data = gm.FS.readFile(path);
          }
        } catch {}
      }
      // fallback for any build that does expose getSaveFile()
      if ((!data || data.length === 0) && gm.getSaveFile) data = gm.getSaveFile();
      if (!data || data.length === 0) return false;
      const res = await fetch(`/api/roms/${romId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Blob([data as BlobPart]),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function exit() {
    // Sync the battery save before leaving, then pop the /play entry instead
    // of pushing the game page on top of it — pushing leaves /play
    // underneath, so B on the game page (history-based) would walk straight
    // back into the emulator. The full-page replace after the pop also tears
    // EmulatorJS down completely.
    await pushBatterySave();
    const target = `/game/${romId}`;
    let handled = false;
    window.addEventListener(
      "popstate",
      () => {
        handled = true;
        window.location.replace(target);
      },
      { once: true }
    );
    window.history.back();
    // Opened directly (nothing to pop)? Replace the /play entry instead.
    setTimeout(() => {
      if (!handled) window.location.replace(target);
    }, 400);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{
        backgroundColor: "#0e141b",
        backgroundImage: "radial-gradient(155.42% 100% at 0% 0%, #060a0e 0%, #0e141b 100%)",
      }}
    >
      {/* No GameHub header — the game fills the viewport and resizes with it.
          Exit lives in EmulatorJS's own control bar (injected far-left). The
          SteamOS / Big Picture frame (flat #0e141b, #23262e hairline, small
          radius, Steam-blue glow) wraps the screen; EmulatorJS letterboxes each
          core at its correct display aspect inside. */}
      <div className="relative flex-1">
        {/* Force EmulatorJS's own elements to fill the mount so the game video
            tracks the frame as it resizes (EJS sizes purely via CSS; its
            handleResize only toggles menu classes, it never resizes the canvas). */}
        <style>{`#ejs-mount,#ejs-mount .ejs_parent,#ejs-mount .ejs_canvas_parent,#ejs-mount .ejs_canvas,#ejs-mount canvas{width:100%!important;height:100%!important}#ejs-mount .ejs_loading_text,#ejs-mount .ejs_loading_text_glow{display:none!important}@keyframes ghToastIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}@keyframes ghToastBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}`}</style>
        {/* All-absolute nesting (definite sizes, no percentage-height chain) so
            the mount — and thus EJS's canvas — always matches the viewport. */}
        <div ref={areaRef} className="absolute inset-3 flex items-center justify-center sm:inset-5">
          <div
            className="relative flex rounded-[8px] bg-[#0e141b] p-2 ring-1 ring-[#23262e] shadow-[0_0_60px_-14px_rgba(26,159,255,0.22),0_18px_48px_rgba(0,0,0,0.72)]"
            style={frameSize ? { width: frameSize.w, height: frameSize.h } : { width: "100%", height: "100%" }}
          >
            <div className="relative flex-1 overflow-hidden rounded-[6px] bg-black ring-1 ring-black/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
              <div id="ejs-mount" className="absolute inset-0" />

            {/* Centered loading / error overlay (covers EJS's default UI until
                the game is running). */}
            {phase !== "ready" && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0e141b]">
                {phase === "loading" ? (
                  <div className="flex w-full max-w-[360px] flex-col items-center gap-4 px-6 text-center">
                    <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/15 border-t-[#1a9fff]" />
                    <div className="w-full">
                      <div className="text-[17px] font-semibold text-bright">{t("startingGame", { title })}</div>
                      <div className="mt-1 truncate text-[13px] text-dim">
                        {progressText || t("loadingCoreGame", { platformName })}
                      </div>
                      {progressPct != null && (
                        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-[#1a9fff] transition-[width] duration-200"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={exit}
                      className="mt-1 rounded-[3px] bg-white/10 px-5 py-2 text-[13px] font-medium text-body transition-colors hover:bg-white/20 hover:text-bright"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                ) : (
                  <div className="flex max-w-[420px] flex-col items-center gap-4 px-6 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e0625f]/15 text-[22px] text-[#e0625f] ring-1 ring-[#e0625f]/40">
                      !
                    </div>
                    <div>
                      <div className="text-[17px] font-semibold text-bright">{t("couldntStartGame")}</div>
                      <div className="mt-1 text-[13px] leading-relaxed text-dim">{err}</div>
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <button
                        onClick={() => window.location.reload()}
                        className="rounded-[3px] bg-[#1a9fff] px-5 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#1a9fff]/90"
                      >
                        {t("retry")}
                      </button>
                      <button
                        onClick={exit}
                        className="rounded-[3px] bg-white/10 px-5 py-2 text-[14px] font-medium text-body transition-colors hover:bg-white/20 hover:text-bright"
                      >
                        {t("exit")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Steam / Big Picture-style toasts (save/load/battery + errors): a dark
          frosted slab that slides in from the right with an icon chip. Info
          notices carry a 4s countdown bar and auto-clear; errors persist with a
          dismiss button. */}
      {toasts.length > 0 && (
        <div className="pointer-events-none absolute right-4 top-4 z-20 flex w-[min(88vw,340px)] flex-col gap-2.5">
          {toasts.map((toast) => {
            const error = toast.kind === "error";
            const accent = error ? "#e0625f" : "#1a9fff";
            return (
              <div
                key={toast.id}
                className="pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-[6px] py-2.5 pl-2.5 pr-3 text-[13.5px] font-medium text-bright shadow-[0_18px_44px_-10px_rgba(0,0,0,0.72)] ring-1 ring-white/10 backdrop-blur-md"
                style={{
                  background: error
                    ? "linear-gradient(180deg, rgba(46,29,31,0.94) 0%, rgba(30,21,23,0.94) 100%)"
                    : "linear-gradient(180deg, rgba(35,40,50,0.94) 0%, rgba(22,27,35,0.94) 100%)",
                  animation: "ghToastIn .22s cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px]"
                  style={{ backgroundColor: error ? "rgba(224,98,95,0.16)" : "rgba(26,159,255,0.16)" }}
                >
                  {error ? (
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3 2.6 20h18.8L12 3Z" />
                      <path d="M12 10v4" />
                      <path d="M12 17.4h.01" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 11.5v4.5" />
                      <path d="M12 7.8h.01" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1 leading-snug">{toast.msg}</span>
                {error && (
                  <button
                    onClick={() => dismissToast(toast.id)}
                    aria-label={t("dismiss")}
                    className="-mr-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-[12px] text-dim transition-colors hover:bg-white/10 hover:text-bright"
                  >
                    ✕
                  </button>
                )}
                {!error && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-[2px] origin-left"
                    style={{ backgroundColor: accent, animation: "ghToastBar 4s linear forwards" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* In-emulator controller-layout editor (opened from the menu-bar button).
          Saving fires LAYOUT_EVENT, which re-resolves the live bridge. */}
      {showControls && (
        <ControllerLayout
          scope={{ kind: "game", romId }}
          title={t("controllerLayoutTitle", { title })}
          onClose={() => setShowControls(false)}
        />
      )}
    </div>
  );
}
