"use client";

import { useEffect, useState } from "react";
import { detectFamily, type ControllerFamily } from "./controllerLayout";

// The connected controller's brand family (null when none / keyboard only), so
// on-screen button prompts can theme to the paired pad the way Steam does.
//
// Browsers only expose a gamepad AFTER a button is pressed on it, so we detect
// through every available signal: a live navigator.getGamepads() read, the
// gamepadconnected event (carries the pad directly), GamepadNav's broadcast, and
// the persisted document.body.dataset.padFamily — plus a light interval so a
// disconnect/reconnect is always reflected.

const FAMILIES: readonly string[] = ["xinput", "playstation", "nintendo", "generic"];

function fromDataset(): ControllerFamily | null {
  if (typeof document === "undefined") return null;
  const v = document.body?.dataset.padFamily;
  return v && FAMILIES.includes(v) ? (v as ControllerFamily) : null;
}

function fromGamepads(): ControllerFamily | null {
  if (typeof navigator === "undefined") return null;
  const gp = [...(navigator.getGamepads?.() ?? [])].find((p): p is Gamepad => !!p);
  return gp ? detectFamily(gp.id) : null;
}

export function useControllerFamily(): ControllerFamily | null {
  const [family, setFamily] = useState<ControllerFamily | null>(null);
  useEffect(() => {
    const set = (next: ControllerFamily | null) =>
      setFamily((cur) => (cur === next ? cur : next));
    const scan = () => set(fromGamepads() ?? fromDataset());

    scan();
    const onBroadcast = (e: Event) =>
      set((e as CustomEvent<ControllerFamily | null>).detail ?? fromGamepads());
    const onConnect = (e: Event) => {
      const gp = (e as GamepadEvent).gamepad;
      set(gp ? detectFamily(gp.id) : fromGamepads());
    };
    window.addEventListener("gh-controller-family", onBroadcast);
    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", scan);
    const id = window.setInterval(scan, 800);
    return () => {
      window.removeEventListener("gh-controller-family", onBroadcast);
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", scan);
      window.clearInterval(id);
    };
  }, []);
  return family;
}
