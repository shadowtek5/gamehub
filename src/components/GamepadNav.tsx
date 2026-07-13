"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { playSound } from "@/lib/sounds";
import { goBackSmart } from "@/lib/navBack";
import { recordNav } from "@/lib/navTrail";
import { loadMap, MAP_EVENT, type PadAction } from "@/lib/gamepadMap";
import { detectFamily, type ControllerFamily } from "@/lib/controllerLayout";

/** Broadcast the paired pad's brand so on-screen prompts (LegendFooter, etc.)
 *  can theme to it. Fired from the one loop that reliably reads the pad. */
export const CONTROLLER_FAMILY_EVENT = "gh-controller-family";

// Steam Big Picture-style controller navigation.
// Deliberately simple input reading (the version that works):
//   D-pad = buttons 12-15, left stick = axes 0/1.
//   A(0) select, B(1) back, X(2) favorite, Y(3) library,
//   L1(4)/R1(5) library tabs, Select(8) Quick Access, Start(9)/Guide(16) menu.
// The poll loop always runs, reads every connected pad, and is wrapped in
// try/catch so one bad frame can never kill navigation.
// Disabled on /play and /player — the game player owns the controller in-game.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]';

type Dir = "up" | "down" | "left" | "right";
type Action = "a" | "b" | "x" | "y" | "lb" | "rb" | "select" | "start";

/** The library grid (all games, or a single system) — the views where the
 *  footer offers Filter (X) and Sort (Y). Elsewhere X/Y are favorite/library. */
function isLibraryView(path: string): boolean {
  return path === "/library" || path.startsWith("/systems/");
}

function visibleWithin(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.closest("[data-nav-skip]")) return false; // pointer-only affordances
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  });
}

/** The top-most open overlay by z-index (falls back to DOM order on ties), so
 *  a keyboard/modal stacked over another overlay traps focus, not the one
 *  underneath it. */
function topOverlay(): Element | null {
  const overlays = [...document.querySelectorAll('[data-overlay="open"]')];
  if (overlays.length === 0) return null;
  return overlays.reduce((top, el) => {
    const z = parseInt(getComputedStyle(el).zIndex) || 0;
    const tz = parseInt(getComputedStyle(top).zIndex) || 0;
    return z >= tz ? el : top;
  });
}

function visibleFocusables(): HTMLElement[] {
  // Trap focus inside the top-most open overlay, but never return an empty world
  const overlay = topOverlay();
  if (overlay) {
    const inOverlay = visibleWithin(overlay);
    if (inOverlay.length > 0) return inOverlay;
  }
  const all = visibleWithin(document);
  // The fixed top/bottom bars are mouse & hotkey targets — keep arrow
  // navigation inside the page content or it ping-pongs between the bars.
  // A chrome element may opt back in with [data-nav-allow] (e.g. the library
  // search field), so the controller can still reach it.
  const content = all.filter(
    (el) => !el.closest('[data-nav="chrome"]') || el.closest("[data-nav-allow]")
  );
  return content.length > 0 ? content : all;
}

/** Gap between two 1-D ranges; 0 when they overlap (same row/column) */
function rangeGap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  if (bStart > aEnd) return bStart - aEnd;
  if (aStart > bEnd) return aStart - bEnd;
  return 0;
}

function moveFocus(dir: Dir) {
  const all = visibleFocusables();
  if (all.length === 0) return;
  const active = document.activeElement;
  const current =
    active instanceof HTMLElement && all.includes(active) ? active : null;
  if (!current) {
    // Focus was lost (e.g. a dropdown/menu just closed and its focused item
    // unmounted). Resume from the focusable nearest the viewport centre rather
    // than jumping to document order's first element — which in settings is the
    // top rail item, making nav feel like it teleported to the top.
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    let pick = all[0];
    let pickScore = Infinity;
    for (const el of all) {
      const r = el.getBoundingClientRect();
      const onScreen =
        r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
      const dx = r.left + r.width / 2 - cx;
      const dy = r.top + r.height / 2 - cy;
      const score = Math.hypot(dx, dy) + (onScreen ? 0 : 1e6);
      if (score < pickScore) {
        pickScore = score;
        pick = el;
      }
    }
    pick.focus();
    pick.scrollIntoView({ block: "nearest", inline: "nearest" });
    return;
  }

  const cur = current.getBoundingClientRect();
  const ccx = cur.left + cur.width / 2;
  const ccy = cur.top + cur.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of all) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const ecx = r.left + r.width / 2;
    const ecy = r.top + r.height / 2;

    // Candidate's center must actually lie in the requested direction
    if (dir === "up" && ecy >= ccy - 2) continue;
    if (dir === "down" && ecy <= ccy + 2) continue;
    if (dir === "left" && ecx >= ccx - 2) continue;
    if (dir === "right" && ecx <= ccx + 2) continue;

    // Edge distance along the movement axis + orthogonal range gap.
    // Overlapping rows/columns get ortho = 0, so "down" strongly prefers
    // the element directly below rather than something across the screen.
    let primary: number;
    let ortho: number;
    if (dir === "up" || dir === "down") {
      primary =
        dir === "down"
          ? Math.max(0, r.top - cur.bottom)
          : Math.max(0, cur.top - r.bottom);
      ortho = rangeGap(cur.left, cur.right, r.left, r.right);
    } else {
      primary =
        dir === "right"
          ? Math.max(0, r.left - cur.right)
          : Math.max(0, cur.left - r.right);
      ortho = rangeGap(cur.top, cur.bottom, r.top, r.bottom);
    }

    const score = primary + ortho * 2 + (ortho > 0 ? 150 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (best) {
    best.focus({ preventScroll: true });
    best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    playSound("navigate");
  } else {
    playSound("bumperEnd");
  }
}

function activate() {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return;
  if (el instanceof HTMLSelectElement) {
    el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    playSound("tab");
  } else {
    // anchors get their sound from SoundManager's click listener; on-screen
    // keyboard keys make their own typing sound, so don't double up here.
    const osk = document.body.dataset.osk === "open";
    if (!osk && !(el instanceof HTMLAnchorElement)) playSound("activate");
    el.click();
  }
}


// 8-way hat switch encoded on one axis (how Chrome exposes DirectInput
// d-pads, e.g. 8BitDo pads in D-input/Switch mode — commonly axes[9]).
const HAT: [number, Dir[]][] = [
  [-1, ["up"]],
  [-5 / 7, ["up", "right"]],
  [-3 / 7, ["right"]],
  [-1 / 7, ["down", "right"]],
  [1 / 7, ["down"]],
  [3 / 7, ["down", "left"]],
  [5 / 7, ["left"]],
  [1, ["up", "left"]],
];

// An axis only counts as a hat after it has been seen at a hat IDLE value
// (outside ±1 — real hats rest there). Analog triggers idle at exactly -1
// and would otherwise read as permanent "up".
const confirmedHats = new Set<string>();

function readState(pads: (Gamepad | null)[], map: Record<PadAction, number>) {
  const dirs: Record<Dir, boolean> = { up: false, down: false, left: false, right: false };
  const acts: Record<Action, boolean> = {
    a: false,
    b: false,
    x: false,
    y: false,
    lb: false,
    rb: false,
    select: false,
    start: false,
  };
  let anyPad = false;
  for (const pad of pads) {
    if (!pad) continue;
    anyPad = true;
    const btn = (i: number) => pad.buttons[i]?.pressed ?? false;

    // D-pad (standard mapping)
    if (btn(12)) dirs.up = true;
    if (btn(13)) dirs.down = true;
    if (btn(14)) dirs.left = true;
    if (btn(15)) dirs.right = true;

    // Left stick
    const ax0 = pad.axes[0] ?? 0;
    const ax1 = pad.axes[1] ?? 0;
    if (ax1 < -0.6) dirs.up = true;
    if (ax1 > 0.6) dirs.down = true;
    if (ax0 < -0.6) dirs.left = true;
    if (ax0 > 0.6) dirs.right = true;

    // Hat-switch d-pad on higher axes (once confirmed as a real hat)
    for (let i = 2; i < pad.axes.length; i++) {
      const v = pad.axes[i];
      if (typeof v !== "number") continue;
      const key = `${pad.index}:${i}`;
      if (Math.abs(v) > 1.02) {
        confirmedHats.add(key);
        continue;
      }
      if (!confirmedHats.has(key)) continue;
      for (const [hv, hd] of HAT) {
        if (Math.abs(v - hv) < 0.03) {
          for (const d of hd) dirs[d] = true;
          break;
        }
      }
    }

    // Face / shoulder buttons follow the user's remap (defaults = standard).
    if (btn(map.a)) acts.a = true;
    if (btn(map.b)) acts.b = true;
    if (btn(map.x)) acts.x = true;
    if (btn(map.y)) acts.y = true;
    if (btn(map.lb)) acts.lb = true;
    if (btn(map.rb)) acts.rb = true;
    if (pad.mapping === "standard") {
      if (btn(map.select)) acts.select = true;
      if (btn(map.start) || btn(16)) acts.start = true;
    } else {
      // Non-standard pads put Select/Start in varying spots: the mapped index
      // (common 8/9), 6/7 (many retro pads), or 10/11 (8BitDo D-input variants)
      if (btn(map.select) || btn(6) || btn(10)) acts.select = true;
      if (btn(map.start) || btn(7) || btn(11) || btn(16)) acts.start = true;
    }
  }
  return { dirs, acts, anyPad };
}

export default function GamepadNav() {
  const pathname = usePathname();
  const router = useRouter();
  const heldUntil = useRef<Partial<Record<Dir, number>>>({});
  // Last-broadcast controller family, so we only fire the event on a change.
  const padFamilyRef = useRef<ControllerFamily | null>(null);
  const prevActs = useRef<Record<Action, boolean>>({
    a: false,
    b: false,
    x: false,
    y: false,
    lb: false,
    rb: false,
    select: false,
    start: false,
  });
  // Stand down in-game: the emulator (EmulatorJS / Ruffle at /play) owns the
  // controller + keyboard, so GameHub's Big-Picture navigation must not run
  // (it would move focus + play nav sounds under the game = input noise).
  const inGame = pathname.startsWith("/play");
  // Read the live path inside the RAF loop without re-subscribing it.
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
    // Feed the in-app trail so game-page Back returns to the exact list/shelf
    // it came from (see navTrail / goBackSmart).
    recordNav(pathname);
  }, [pathname]);
  // Live button remap (localStorage), reloaded when the settings page saves it.
  const mapRef = useRef(loadMap());
  useEffect(() => {
    const reload = () => {
      mapRef.current = loadMap();
    };
    window.addEventListener(MAP_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(MAP_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);
  // While a capture UI (button test / remap / setup wizard) is open it needs
  // raw controller input, so it asks us to stand down.
  const suspendRef = useRef(false);
  useEffect(() => {
    const on = (e: Event) => {
      suspendRef.current = !!(e as CustomEvent<boolean>).detail;
    };
    window.addEventListener("gh-gamepad-capture", on);
    return () => window.removeEventListener("gh-gamepad-capture", on);
  }, []);

  // Keyboard arrows drive the same spatial navigation as the D-pad,
  // so nav works without a controller and input problems are isolatable.
  useEffect(() => {
    if (inGame) return;
    const KEY_DIRS: Record<string, Dir> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (typing) return;
      const dir = KEY_DIRS[e.key];
      const key = e.key.toLowerCase();
      if (dir) {
        e.preventDefault();
        moveFocus(dir);
      } else if (e.key === "Backspace" || key === "b") {
        e.preventDefault();
        if (document.body.dataset.osk === "open") {
          window.dispatchEvent(new Event("gh-osk-back"));
        } else {
          goBackSmart(router.push);
        }
      } else if (key === "a") {
        // mirror the controller face buttons on the keyboard
        e.preventDefault();
        activate();
      } else if (key === "x") {
        e.preventDefault();
        if (isLibraryView(pathRef.current)) {
          window.dispatchEvent(new Event("gh-library-filter"));
        } else {
          const el = document.activeElement?.closest?.("[data-rom-id]");
          const id = el?.getAttribute("data-rom-id");
          if (id) {
            fetch(`/api/roms/${id}/favorite`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ toggle: true }),
            })
              .then(() => router.refresh())
              .catch(() => {});
            playSound("confirm");
          }
        }
      } else if (key === "y") {
        e.preventDefault();
        if (isLibraryView(pathRef.current)) {
          window.dispatchEvent(new Event("gh-library-sort"));
        } else {
          router.push("/library");
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inGame, router]);

  useEffect(() => {
    if (inGame) return;
    let raf = 0;

    async function toggleFavoriteFocused() {
      const el = document.activeElement?.closest?.("[data-rom-id]");
      const id = el?.getAttribute("data-rom-id");
      if (!id) return;
      await fetch(`/api/roms/${id}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toggle: true }),
      }).catch(() => {});
      router.refresh();
    }

    const handlers: Record<Action, () => void> = {
      a: activate,
      b: () => {
        // While the on-screen keyboard is up, B dismisses it instead of
        // navigating back (and never reaches goBackSmart / an underlying modal).
        if (document.body.dataset.osk === "open") {
          window.dispatchEvent(new Event("gh-osk-back"));
          return;
        }
        goBackSmart(router.push);
      },
      x: () => {
        if (isLibraryView(pathRef.current)) window.dispatchEvent(new Event("gh-library-filter"));
        else void toggleFavoriteFocused();
      },
      y: () => {
        if (isLibraryView(pathRef.current)) window.dispatchEvent(new Event("gh-library-sort"));
        else router.push("/library");
      },
      lb: () => window.dispatchEvent(new Event("gh-lb")),
      rb: () => window.dispatchEvent(new Event("gh-rb")),
      select: () => {
        // Options is contextual: a focused game card → its options menu, a
        // system card on the systems grid → its cog menu, else Quick Access.
        const el = document.activeElement;
        const gameId = el?.closest?.("[data-rom-id]")?.getAttribute("data-rom-id");
        if (gameId && !pathRef.current.startsWith("/game/")) {
          window.dispatchEvent(new CustomEvent("gh-game-options", { detail: gameId }));
          return;
        }
        const slug = el?.closest?.("[data-system-slug]")?.getAttribute("data-system-slug");
        if (slug && pathRef.current === "/systems") {
          window.dispatchEvent(new CustomEvent("gh-system-options", { detail: slug }));
          return;
        }
        window.dispatchEvent(new Event("gh-quickaccess"));
      },
      start: () => window.dispatchEvent(new Event("gh-mainmenu")),
    };

    function poll(now: number) {
      try {
        const pads = [...(navigator.getGamepads?.() ?? [])];
        const { dirs, acts, anyPad } = readState(pads, mapRef.current);

        if (anyPad) document.body.dataset.gamepad = "on";

        // Detect the paired pad's brand from the same data nav uses, and
        // broadcast on change so button-prompt glyphs re-theme immediately.
        const gp = pads.find((p): p is Gamepad => !!p);
        const fam = gp ? detectFamily(gp.id) : null;
        if (fam !== padFamilyRef.current) {
          padFamilyRef.current = fam;
          document.body.dataset.padFamily = fam ?? "";
          window.dispatchEvent(new CustomEvent(CONTROLLER_FAMILY_EVENT, { detail: fam }));
        }

        // A capture UI owns the controller right now — read nothing into nav so
        // presses land in the tester/remap instead of moving focus.
        if (suspendRef.current) {
          prevActs.current = acts;
          raf = requestAnimationFrame(poll);
          return;
        }

        for (const dir of Object.keys(dirs) as Dir[]) {
          const held = heldUntil.current;
          if (dirs[dir]) {
            if (held[dir] === undefined) {
              moveFocus(dir);
              held[dir] = now + 400;
            } else if (now >= held[dir]!) {
              moveFocus(dir);
              held[dir] = now + 150;
            }
          } else {
            delete held[dir];
          }
        }

        // The on-screen keyboard owns the whole pad while it's up: only A
        // (press a key) and B (dismiss) get through; X/Y/bumpers/Select/Start
        // are swallowed so they can't fire library/menu actions mid-typing.
        const oskOpen = document.body.dataset.osk === "open";
        for (const action of Object.keys(acts) as Action[]) {
          if (acts[action] && !prevActs.current[action]) {
            if (!oskOpen || action === "a" || action === "b") handlers[action]();
          }
          prevActs.current[action] = acts[action];
        }
      } catch {
        // never let one bad frame kill the loop
      }
      raf = requestAnimationFrame(poll);
    }

    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [inGame, router]);

  return null;
}
