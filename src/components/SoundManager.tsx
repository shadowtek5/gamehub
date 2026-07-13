"use client";

// Global UI-sound hooks: link-click sounds (game pages, play) via one
// delegated listener, so server components don't need client wrappers.

import { useEffect } from "react";
import { playSound, preloadSounds } from "@/lib/sounds";

export default function SoundManager() {
  useEffect(() => {
    preloadSounds(["navigate", "activate", "back", "menuOpen", "menuClose", "tab", "launch", "intoGame"]);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      // the on-screen keyboard plays its own typing sounds — don't add the
      // generic button "activate" on top of every key press
      if (target?.closest?.("[data-osk]")) return;
      // link launch/into-game sounds
      const link = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (link) {
        const href = link.getAttribute("href") ?? "";
        if (href.startsWith("/play/")) playSound("launch");
        else if (href.startsWith("/game/")) playSound("intoGame");
      }
      // checkbox-style controls (role="checkbox" buttons): aria-checked is
      // still the OLD state at click time, so invert it for the sound
      const checkbox = target?.closest?.('[role="checkbox"]') as HTMLElement | null;
      if (checkbox) {
        playSound(checkbox.getAttribute("aria-checked") === "true" ? "toggleOff" : "toggleOn");
        return;
      }
      // any Steam-style button (.DialogButton — GpButton or shim-decorated
      // btn-*) activates with the standard sound, unless something more
      // specific (switch/link) already handled it above
      const dialogButton = target?.closest?.(".DialogButton") as HTMLElement | null;
      if (
        dialogButton &&
        !link &&
        !dialogButton.closest('[role="switch"]') &&
        !dialogButton.hasAttribute("aria-haspopup") // dropdowns play their own open/close
      ) {
        playSound("activate");
      }
    }
    // native <input type="checkbox">: change fires with the NEW checked state
    function onChange(e: Event) {
      const el = e.target as HTMLInputElement | null;
      if (el && el.tagName === "INPUT" && el.type === "checkbox") {
        playSound(el.checked ? "toggleOn" : "toggleOff");
      }
    }
    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("change", onChange, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("change", onChange, { capture: true });
    };
  }, []);

  return null;
}
