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
import { playSound } from "@/lib/sounds";
import { setInGameMenu } from "@/lib/chromeOverlay";
import InGameMenu from "@/components/InGameMenu";

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
        /** current save-state bytes (newer EmulatorJS builds); used by the Quick Menu */
        getState?: () => Uint8Array | null;
        /** restart the running game (if the build exposes it) */
        restart?: () => void;
        /** stop (0) / start (1) the core's emscripten main loop */
        toggleMainLoop?: (on: number) => void;
        /** clear all active cheats */
        resetCheat?: () => void;
        /** register/enable a cheat: (index, enabled, code) */
        setCheat?: (index: number, enabled: boolean, code: string) => void;
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
      /** Apply an EmulatorJS setting live (e.g. "shader") without a relaunch */
      changeSettingOption?: (key: string, value: string) => void;
      /** EJS-created DOM elements; `parent` is where EJS binds keyboard input */
      elements?: { parent?: HTMLElement };
      /** pause the emulator */
      pause?: () => void;
      /** fire an EmulatorJS lifecycle event (e.g. "exit") */
      callEvent?: (event: string) => void;
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
  const gm = window.EJS_emulator?.gameManager;
  if (!gm?.loadState) {
    console.error("[GameHub] loadState: gameManager.loadState unavailable");
    notify("Failed to load state", "error");
    return;
  }
  if (!data || data.byteLength === 0) {
    console.error("[GameHub] loadState: empty state data");
    notify("Failed to load state", "error");
    return;
  }
  try {
    gm.loadState(new Uint8Array(data));
    console.log("[GameHub] gameManager.loadState called OK");
    notify(label);
  } catch (e) {
    console.error("[GameHub] loadState threw:", e);
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
  shader,
  gameLogo,
  gameCover,
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
  /** Per-game video shader (EmulatorJS bundled .glslp name), or undefined */
  shader?: string;
  /** Game clear-logo (wordmark) shown atop the Quick Menu, if scraped */
  gameLogo?: string;
  /** Game cover/box art used as the small menu game icon */
  gameCover?: string;
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
  // Live video-filter selection (starts at the per-game pref passed in, then
  // tracks in-menu changes so the Quick Menu can tick the active one).
  const [activeShader, setActiveShader] = useState(shader ?? "disabled");
  // F3 diagnostic overlay: live gamepad + EmulatorJS input-gate state, so input
  // problems can be read on-device without the browser console.
  const [debug, setDebug] = useState(false);
  const [dbgText, setDbgText] = useState("");
  // In-emulator controller-layout editor (opened from the menu-bar button).
  const [showControls, setShowControls] = useState(false);
  // Steam-Deck-style Quick Menu overlay (Select+Start / Escape / bar button).
  const [menuOpen, setMenuOpen] = useState(false);
  const menuOpenRef = useRef(false);
  useEffect(() => {
    menuOpenRef.current = menuOpen;
    // Lift GameHub's real header/footer above the fullscreen emulator while the
    // Quick Menu is open (and show the footer on /play).
    setInGameMenu(menuOpen);
    return () => setInGameMenu(false);
  }, [menuOpen]);

  // While the F3 diagnostic overlay is on, sample gamepad + EmulatorJS input
  // state a few times a second so input issues can be read on-device.
  useEffect(() => {
    if (!debug) return;
    const id = setInterval(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = window.EJS_emulator as any;
      const pads = [...(navigator.getGamepads?.() ?? [])].filter(Boolean).map((p) => {
        const pressed = p!.buttons.map((b, i) => (b.pressed ? i : null)).filter((x) => x !== null);
        return `${p!.mapping || "?"} btns[${pressed.join(",") || "-"}] ${p!.id.slice(0, 24)}`;
      });
      const parent = e?.elements?.parent as HTMLElement | undefined;
      let popup = "?";
      try {
        popup = String(e?.isPopupOpen?.());
      } catch {}
      let kb = "?";
      try {
        kb = String(e?.getSettingValue?.("keyboardInput"));
      } catch {}
      const lines = [
        `pads: ${pads.length}`,
        ...pads.map((p, i) => ` #${i} ${p}`),
        `menuOpen: ${menuOpenRef.current}`,
        `EJS.started: ${e?.started}`,
        `listenEl: ${parent ? parent.tagName + "." + (parent.className || "").split(" ")[0] : "MISSING"}`,
        `isPopupOpen: ${popup}`,
        `settingsMenu: ${e?.settingsMenu?.style?.display ?? "?"}`,
        `keyboardInput: ${kb}`,
      ];
      setDbgText(lines.join("\n"));
    }, 250);
    return () => clearInterval(id);
  }, [debug]);
  // Clip recording (canvas → webm, downloaded on stop).
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Stop (without triggering a download) if we unmount mid-recording.
  useEffect(
    () => () => {
      const r = recorderRef.current;
      if (r && r.state !== "inactive") {
        r.onstop = null;
        try {
          r.stop();
        } catch {}
      }
    },
    []
  );
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
      // Per-game video filter (applied at boot). "disabled"/none → leave default.
      ...(shader && shader !== "disabled" ? { shader } : {}),
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
      // Mark this game as "now playing" immediately (don't wait for the 60s
      // heartbeat) so friends see it right away.
      fetch(`/api/roms/${romId}/heartbeat`, { method: "POST" }).catch(() => {});
      // Apply the user's saved cheats once the core is up.
      fetch(`/api/roms/${romId}/cheats`)
        .then((r) => r.json())
        .then((d) => applyCheats(d.cheats ?? []))
        .catch(() => {});
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
        // Dispatch synthetic game keys at the exact element EmulatorJS binds its
        // keyboard listener to (elements.parent — a child of #ejs-mount). Events
        // sent to #ejs-mount would bubble upward and never reach that child, so
        // targeting the mount alone silently drops all controller input.
        const target =
          window.EJS_emulator?.elements?.parent ??
          document.querySelector<HTMLElement>("#ejs-mount .ejs_parent") ??
          document.getElementById("ejs-mount") ??
          document.body;
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
        // Select + Start together toggles the Quick Menu (Steam-Deck style).
        const combo = now.select && now.start;
        const comboWas = prev.select && prev.start;
        if (combo && !comboWas) {
          menuOpenRef.current = !menuOpenRef.current;
          setMenuOpen(menuOpenRef.current);
          playSound(menuOpenRef.current ? "menuOpen" : "menuClose");
        }

        if (menuOpenRef.current) {
          // Drive the overlay, not the game: forward D-pad/A/B as key events the
          // menu listens for, and DON'T send any input to the emulator.
          const edge = (k: ConsoleKey) => now[k] && !prev[k];
          if (edge("up")) sendKey(window, "keydown", "ArrowUp", 38);
          if (edge("down")) sendKey(window, "keydown", "ArrowDown", 40);
          if (edge("left")) sendKey(window, "keydown", "ArrowLeft", 37);
          if (edge("right")) sendKey(window, "keydown", "ArrowRight", 39);
          if (edge("a")) sendKey(window, "keydown", "Enter", 13);
          if (edge("b")) sendKey(window, "keydown", "Escape", 27);
          for (const action of Object.keys(now) as ConsoleKey[]) prev[action] = now[action];
          raf = requestAnimationFrame(pollPad);
          return;
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

    // Chrome only exposes a gamepad after a button press while the tab is
    // focused, and drops it on reload. React to (re)connection immediately:
    // reset the detect cache and reload the layout so the pad works at once.
    const onPadConnected = (e: GamepadEvent) => {
      console.log("[GameHub] gamepad connected:", e.gamepad?.id, e.gamepad?.mapping);
      lastPadId = "";
      void loadLayout(familyRef.current);
    };
    window.addEventListener("gamepadconnected", onPadConnected);

    // Inject an "Exit" button at the far left of EmulatorJS's own control bar
    // (there's no GameHub header anymore). The bar is built after the game
    // starts, so watch the mount for it.
    const EXIT_SVG =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><path d="M14 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7"/><path d="M11 12h9m0 0-3.5-3.5M20 12l-3.5 3.5"/></svg>';
    const CONTROLS_SVG =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/></svg>';
    const CAMERA_SVG =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/></svg>';

    // Capture the current frame → save it to the user's screenshot gallery for
    // this game. Reuses the same preserveDrawingBuffer canvas grab as save-state
    // thumbnails. Bound to the bar's camera button and the F2 shortcut.
    let shotBusy = false;
    const captureScreenshot = async () => {
      if (shotBusy) return;
      shotBusy = true;
      try {
        const canvas = document.querySelector<HTMLCanvasElement>("#ejs-mount canvas");
        const shot = await captureCanvasShot();
        if (!shot) {
          pushToast(t("screenshotFailed"), "error");
          return;
        }
        const form = new FormData();
        form.append("shot", shot, "shot.png");
        if (canvas?.width && canvas?.height) {
          form.append("width", String(canvas.width));
          form.append("height", String(canvas.height));
        }
        const res = await fetch(`/api/roms/${romId}/screenshots`, { method: "POST", body: form });
        pushToast(res.ok ? t("screenshotSaved") : t("screenshotFailed"), res.ok ? "info" : "error");
      } catch {
        pushToast(t("screenshotFailed"), "error");
      } finally {
        shotBusy = false;
      }
    };
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
      // Menu, Screenshot, Controls, then Exit — all pinned to the far left.
      const MENU_SVG =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:20px;height:20px"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>';
      const shotBtn = mk("gh-shot-btn", CAMERA_SVG, t("screenshot"), () => void captureScreenshot());
      const controls = mk("gh-controls-btn", CONTROLS_SVG, t("controllerLayout"), () =>
        setShowControls(true)
      );
      const menuBtn = mk("gh-menu-btn", MENU_SVG, t("quickMenu"), () => {
        menuOpenRef.current = true;
        setMenuOpen(true);
        playSound("menuOpen");
      });
      const REC_SVG =
        '<svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px"><circle cx="12" cy="12" r="8"/></svg>';
      const recBtn = mk("gh-rec-btn", REC_SVG, t("recordClip"), () => toggleRecording());
      const exitBtn = mk("gh-exit-btn", EXIT_SVG, t("exitToGame"), () => void exit());
      bar.insertBefore(shotBtn, bar.firstChild);
      bar.insertBefore(recBtn, bar.firstChild);
      bar.insertBefore(controls, bar.firstChild);
      bar.insertBefore(menuBtn, bar.firstChild);
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

    // F2 = capture a screenshot (Steam's F12 is taken by browser devtools).
    // F1 = toggle the Quick Menu (the keyboard equivalent of Select+Start).
    const onShotKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        void captureScreenshot();
      } else if (e.key === "F1") {
        e.preventDefault();
        menuOpenRef.current = !menuOpenRef.current;
        setMenuOpen(menuOpenRef.current);
        playSound(menuOpenRef.current ? "menuOpen" : "menuClose");
      } else if (e.key === "F9") {
        e.preventDefault();
        setDebug((d) => !d);
      }
    };
    window.addEventListener("keydown", onShotKey);

    // Clear "now playing" when the tab is closed/hidden for real (SPA unmount is
    // handled by the cleanup below). sendBeacon survives page teardown.
    const stopPlaying = () => {
      try {
        navigator.sendBeacon?.(`/api/roms/${romId}/stop-playing`);
      } catch {}
    };
    window.addEventListener("pagehide", stopPlaying);

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

    const interval = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/roms/${romId}/heartbeat`, { method: "POST" });
        const data = await res.json().catch(() => null);
        // Kid-profile limit hit (or now outside allowed hours) mid-session → end it.
        if (data?.blocked) {
          pushToast(data.reason === "schedule" ? t("playOutsideHours") : t("playTimeUp"), "error");
          setTimeout(() => void exit(), 2500);
        }
      } catch {
        /* offline — try again next beat */
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
      window.removeEventListener("keydown", onShotKey);
      window.removeEventListener("gamepadconnected", onPadConnected);
      window.removeEventListener("pagehide", stopPlaying);
      // SPA navigation away (Exit button, back) unmounts us here — clear now-playing.
      stopPlaying();
      // Forcibly tear EmulatorJS down so leaving the page ANY way (nav to Home,
      // avatar, Back, browser back) kills the WASM game loop + audio instead of
      // leaving it running in the background. Guarded on readyRef so React's dev
      // StrictMode remount (which unmounts before the game has started) doesn't
      // nuke the instance mid-load.
      if (readyRef.current) {
        try {
          const em = window.EJS_emulator;
          em?.gameManager?.toggleMainLoop?.(0);
          em?.pause?.();
          em?.callEvent?.("exit");
        } catch {}
        try {
          delete (window as { EJS_emulator?: unknown }).EJS_emulator;
        } catch {}
      }
    };
  }, [romId, title, core, platformSlug, resumeStateId, biosUrl, shader]);

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

  // ---- Quick Menu actions (component scope; hoisted so the JSX can use them) ----
  async function shotNow() {
    const canvas = document.querySelector<HTMLCanvasElement>("#ejs-mount canvas");
    const shot = await captureCanvasShot();
    if (!shot) {
      pushToast(t("screenshotFailed"), "error");
      return;
    }
    const form = new FormData();
    form.append("shot", shot, "shot.png");
    if (canvas?.width && canvas?.height) {
      form.append("width", String(canvas.width));
      form.append("height", String(canvas.height));
    }
    try {
      const res = await fetch(`/api/roms/${romId}/screenshots`, { method: "POST", body: form });
      pushToast(res.ok ? t("screenshotSaved") : t("screenshotFailed"), res.ok ? "info" : "error");
    } catch {
      pushToast(t("screenshotFailed"), "error");
    }
  }

  function barButton(match: RegExp): HTMLElement | undefined {
    const mount = document.getElementById("ejs-mount");
    return [...(mount?.querySelectorAll<HTMLElement>(".ejs_menu_button") ?? [])].find((b) =>
      match.test((b.getAttribute("title") || b.getAttribute("aria-label") || "").toLowerCase())
    );
  }

  async function saveStateNow() {
    const gm = window.EJS_emulator?.gameManager;
    // getState() throws on cores that report the state isn't ready — fall back
    // to EmulatorJS's own Save State button (handled by EJS_onSaveState) instead
    // of letting the rejection escape and silently drop the save.
    let state: Uint8Array | null = null;
    try {
      state = gm?.getState?.() ?? null;
    } catch (e) {
      console.error("[GameHub] getState threw:", e);
    }
    if (state && state.length) {
      const form = new FormData();
      form.append("state", new Blob([state as BlobPart]), "save.state");
      const shot = await captureCanvasShot();
      if (shot) form.append("screenshot", shot, "shot.png");
      try {
        const res = await fetch(`/api/roms/${romId}/states`, { method: "POST", body: form });
        pushToast(res.ok ? t("stateSaved") : t("saveFailed"), res.ok ? "info" : "error");
      } catch {
        pushToast(t("saveFailed"), "error");
      }
    } else {
      // Older builds don't expose getState — fall back to EmulatorJS's own button.
      const b = barButton(/save state/);
      if (b) b.click();
      else pushToast(t("saveFailed"), "error");
    }
  }

  async function loadStateById(stateId: number) {
    console.log("[GameHub] loadStateById:", stateId);
    try {
      const file = await fetch(`/api/states/${stateId}`);
      console.log("[GameHub] state fetch status:", file.status, file.ok);
      if (file.ok) {
        const buf = await file.arrayBuffer();
        console.log("[GameHub] state bytes:", buf.byteLength);
        await loadStateData(buf, t("stateLoaded"), pushToast);
      } else pushToast(t("loadFailed"), "error");
    } catch (e) {
      console.error("[GameHub] loadStateById failed:", e);
      pushToast(t("loadFailed"), "error");
    }
  }

  function restartGame() {
    const gm = window.EJS_emulator?.gameManager;
    if (gm?.restart) {
      try {
        gm.restart();
        pushToast(t("restarted"));
        return;
      } catch {
        /* fall through */
      }
    }
    const b = barButton(/restart/);
    if (b) {
      b.click();
      pushToast(t("restarted"));
    } else {
      pushToast(t("restartUnavailable"), "error");
    }
  }

  // ---- EmulatorJS control-bar actions surfaced in our Quick Menu ----
  // EmulatorJS's own bar is hidden (clean interface); we drive its buttons by
  // clicking them programmatically. Each returns whether the button was found so
  // the menu can hide/annotate actions the running core doesn't expose.
  function clickBar(match: RegExp): boolean {
    const b = barButton(match);
    if (b) {
      b.click();
      return true;
    }
    return false;
  }
  function togglePause() {
    clickBar(/pause|play|resume/);
  }
  function fastForward() {
    if (!clickBar(/fast.?forward/)) pushToast(t("actionUnavailable"), "error");
  }
  function toggleMute() {
    if (!clickBar(/mute|volume/)) pushToast(t("actionUnavailable"), "error");
  }
  function toggleFullscreen() {
    if (clickBar(/full.?screen/)) return;
    // Fallback if EmulatorJS's fullscreen button isn't present.
    const el = document.getElementById("ejs-mount") ?? document.documentElement;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.();
  }
  function openNetplay() {
    if (!clickBar(/netplay/)) pushToast(t("actionUnavailable"), "error");
  }
  async function setShaderPref(next: string) {
    // Apply immediately to the running game — EmulatorJS recompiles the shader
    // live via changeSettingOption("shader", …), so no relaunch is needed.
    try {
      window.EJS_emulator?.changeSettingOption?.("shader", next);
    } catch (e) {
      console.error("[GameHub] live shader apply failed:", e);
    }
    setActiveShader(next);
    // Persist the choice so it's the default next launch too.
    try {
      const res = await fetch(`/api/roms/${romId}/emu-prefs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shader: next }),
      });
      pushToast(res.ok ? t("videoFilterSaved") : t("saveFailed"), res.ok ? "info" : "error");
    } catch {
      pushToast(t("saveFailed"), "error");
    }
  }

  // Push the current cheat list to the core: clear, then register every enabled
  // cheat (one entry per code line). Called on game start and whenever the Quick
  // Menu's cheat panel changes the list.
  function applyCheats(list: { code: string; enabled: number | boolean }[]) {
    const gm = window.EJS_emulator?.gameManager;
    if (!gm?.setCheat) return;
    try {
      gm.resetCheat?.();
    } catch {}
    let i = 0;
    for (const c of list) {
      if (!c.enabled) continue;
      for (const line of String(c.code).split(/\r?\n/)) {
        const code = line.trim();
        if (!code) continue;
        // Isolate each code so one malformed entry can't abort the rest.
        try {
          gm.setCheat(i, true, code);
          i++;
        } catch (e) {
          console.error("[GameHub] setCheat failed for", code, e);
        }
      }
    }
  }

  // ---- clip recording: capture the game canvas to a downloadable webm ----
  function pickClipMime(): string {
    const cands = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
    return cands.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) ?? "";
  }
  function startRecording() {
    const canvas = document.querySelector<HTMLCanvasElement>("#ejs-mount canvas");
    if (!canvas || typeof MediaRecorder === "undefined" || !canvas.captureStream) {
      pushToast(t("recordUnavailable"), "error");
      return;
    }
    try {
      const stream = canvas.captureStream(30);
      const mime = pickClipMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
        chunksRef.current = [];
        if (!blob.size) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title.replace(/[^\w.-]+/g, "_")}-clip.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        pushToast(t("clipSaved"));
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      pushToast(t("recording"));
    } catch {
      pushToast(t("recordUnavailable"), "error");
    }
  }
  function stopRecording() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {}
    }
    recorderRef.current = null;
    setRecording(false);
  }
  function toggleRecording() {
    if (recording) stopRecording();
    else startRecording();
  }

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

  // Leave the game for another part of the app (Home, Library, …). Save the
  // battery first, then hard-navigate so EmulatorJS is fully torn down (a
  // client-side push would leave the WASM loop + audio running).
  async function leaveTo(path: string) {
    await pushBatterySave();
    window.location.assign(path);
  }

  async function exit() {
    // Save the battery, then REPLACE the /play entry with the game page: a full
    // load tears EmulatorJS down completely, and replacing (not pushing) drops
    // /play from history so Back on the game page can't walk into the emulator.
    await pushBatterySave();
    window.location.replace(`/game/${romId}`);
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
        <style>{`#ejs-mount,#ejs-mount .ejs_parent,#ejs-mount .ejs_canvas_parent,#ejs-mount .ejs_canvas,#ejs-mount canvas{width:100%!important;height:100%!important}#ejs-mount .ejs_loading_text,#ejs-mount .ejs_loading_text_glow{display:none!important}#ejs-mount .ejs_menu_bar,#ejs-mount .ejs_menu_bar_hidden{display:none!important}@keyframes ghToastIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}@keyframes ghToastBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}`}</style>
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

      {recording && (
        <div className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-[12px] font-bold text-white ring-1 ring-white/15 backdrop-blur-sm">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#e5544b]" />
          {t("recording")}
        </div>
      )}

      {debug && (
        <div className="pointer-events-none absolute right-3 top-3 z-40 max-w-[300px] whitespace-pre-wrap rounded bg-black/85 p-2.5 font-mono text-[10px] leading-[1.35] text-[#7dffa6] ring-1 ring-white/20">
          <div className="mb-1 font-bold text-white">input debug (F3)</div>
          {dbgText || "…"}
        </div>
      )}

      {/* Subtle mouse fallback to open the Quick Menu (controllers use
          Select+Start, keyboards use F1). Top-right so it's out of the way. */}
      {phase === "ready" && !menuOpen && (
        <button
          onClick={() => {
            menuOpenRef.current = true;
            setMenuOpen(true);
            playSound("menuOpen");
          }}
          aria-label={t("quickMenu")}
          title={t("quickMenu")}
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white/70 opacity-40 ring-1 ring-white/10 backdrop-blur-sm transition-all hover:bg-black/75 hover:text-white hover:opacity-100"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-[18px] w-[18px]">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
      )}

      <InGameMenu
        open={menuOpen}
        romId={romId}
        title={title}
        gameLogo={gameLogo}
        gameCover={gameCover}
        recording={recording}
        currentShader={activeShader}
        onClose={() => {
          menuOpenRef.current = false;
          setMenuOpen(false);
        }}
        onSaveState={() => void saveStateNow()}
        onLoadState={(id) => void loadStateById(id)}
        onScreenshot={() => void shotNow()}
        onControls={() => setShowControls(true)}
        onRestart={restartGame}
        onRecord={toggleRecording}
        onTogglePause={togglePause}
        onFastForward={fastForward}
        onMute={toggleMute}
        onFullscreen={toggleFullscreen}
        onNetplay={openNetplay}
        onSetShader={(s) => void setShaderPref(s)}
        onApplyCheats={applyCheats}
        onNavigate={(path) => void leaveTo(path)}
        onExit={() => void exit()}
      />
    </div>
  );
}
