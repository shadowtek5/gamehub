"use client";

// SteamOS class-vocabulary shim (see docs/steamos-reference.md).
//
// Valve's gamepad UI exposes a stable set of semantic class names that
// deckthemes.com / CSS Loader themes target: DialogButton, Panel,
// Focusable, and the focus classes gpfocus / gpfocuswithin. This shim
// keeps that vocabulary present in GameHub's DOM:
//
//  1. decorates our own utility classes with the Steam equivalents
//     (re-applied by a MutationObserver whenever React re-renders), and
//  2. mirrors DOM focus into .gpfocus on the focused element and
//     .gpfocuswithin on its ancestors — exactly how Steam marks controller
//     focus (it never uses :focus).

import { useEffect } from "react";

const DECORATIONS: [string, string[]][] = [
  ["btn-gray", ["DialogButton", "Secondary", "Focusable"]],
  ["btn-blue", ["DialogButton", "Primary", "Focusable"]],
  ["btn-play", ["DialogButton", "Primary", "appactionbutton_Green_gh", "Focusable"]],
  ["btn-danger", ["DialogButton", "Focusable"]],
  ["panel", ["Panel"]],
  ["input-dark", ["DialogInput", "DialogTextInputBase", "gamepaddialog_BasicTextInput_gh", "Focusable"]],
  ["deck-card", ["Focusable"]],
];

function decorateElement(el: Element) {
  for (const [base, extras] of DECORATIONS) {
    if (el.classList.contains(base)) {
      for (const extra of extras) {
        if (!el.classList.contains(extra)) el.classList.add(extra);
      }
    }
  }
}

function decorateTree(root: ParentNode & { querySelectorAll: Element["querySelectorAll"] }) {
  if (root instanceof Element) decorateElement(root);
  for (const [base] of DECORATIONS) {
    root.querySelectorAll(`.${base}`).forEach(decorateElement);
  }
}

export default function SteamosShim() {
  useEffect(() => {
    decorateTree(document.body);

    // BPM is NOT CSS-zoomed: probing its DOM shows fixed CSS px (12px row
    // padding, 16px text) with a FLUID layout (fixed ~270px rail + flexible
    // content). The "large" look in screenshots is just the display's hi-DPI
    // device-pixel-ratio, which the browser already handles. So we render at
    // 1x and let the layout flex — matching BPM's real pixel sizes exactly.
    const applyZoom = () => {
      (document.body.style as CSSStyleDeclaration & { zoom?: string }).zoom = "1";
      document.documentElement.style.setProperty("--gh-zoom", "1");
    };
    applyZoom();
    window.addEventListener("resize", applyZoom);

    // ---- focus mirroring ----
    let focused: Element | null = null;
    let chain: Element[] = [];

    function clearFocusClasses() {
      focused?.classList.remove("gpfocus");
      for (const el of chain) el.classList.remove("gpfocuswithin");
      focused = null;
      chain = [];
    }

    function applyFocusClasses() {
      const el = document.activeElement;
      clearFocusClasses();
      if (!(el instanceof Element) || el === document.body || el === document.documentElement) return;
      el.classList.add("gpfocus");
      focused = el;
      let p = el.parentElement;
      while (p && p !== document.documentElement) {
        p.classList.add("gpfocuswithin");
        chain.push(p);
        p = p.parentElement;
      }
    }

    document.addEventListener("focusin", applyFocusClasses);
    document.addEventListener("focusout", () => {
      // only clear when focus truly left (not moving between elements)
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) clearFocusClasses();
      });
    });

    // ---- keep decorations through React re-renders ----
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "childList") {
          m.addedNodes.forEach((n) => {
            if (n instanceof Element) decorateTree(n);
          });
        } else if (m.type === "attributes" && m.target instanceof Element) {
          decorateElement(m.target);
          // React re-render can wipe gpfocus off the active element
          if (m.target === document.activeElement && !m.target.classList.contains("gpfocus")) {
            applyFocusClasses();
          }
        }
      }
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    applyFocusClasses();
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", applyZoom);
      document.removeEventListener("focusin", applyFocusClasses);
      clearFocusClasses();
    };
  }, []);

  return null;
}
