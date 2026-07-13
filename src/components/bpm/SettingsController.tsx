"use client";

// Settings → Controller. Identifies the connected controller (Gamepad API),
// and lets the user remap the navigation buttons. Button test and remap/setup
// run in modals that SUSPEND GamepadNav (via gh-gamepad-capture) so presses
// land in the tester/binder instead of moving focus. The map is per-device
// (localStorage) and read live by GamepadNav.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { GpSubHeader, GpButton, GpRow, GpModal, GpToggle } from "./primitives";
import { rewindEnabled, setRewindEnabled } from "@/lib/playPrefs";
import ControllerLayout, { ControllerWireframe, gamepadActiveInputs } from "@/components/ControllerLayout";
import { detectFamily, type ControllerFamily } from "@/lib/controllerLayout";
import {
  PAD_ACTIONS,
  DEFAULT_MAP,
  buttonLabel,
  loadMap,
  saveMap,
  resetMap,
  type PadAction,
} from "@/lib/gamepadMap";
import { playSound } from "@/lib/sounds";

interface PadInfo {
  index: number;
  id: string;
  mapping: string;
  buttons: number;
  axes: number;
}

// 8-way hat encoded on one axis (retro D-input pads), mirrors GamepadNav.
const HAT: [number, ("up" | "down" | "left" | "right")[]][] = [
  [-1, ["up"]],
  [-5 / 7, ["up", "right"]],
  [-3 / 7, ["right"]],
  [-1 / 7, ["down", "right"]],
  [1 / 7, ["down"]],
  [3 / 7, ["down", "left"]],
  [5 / 7, ["left"]],
  [1, ["up", "left"]],
];

function readDirections(gp: Gamepad) {
  const b = (i: number) => gp.buttons[i]?.pressed ?? false;
  const ax0 = gp.axes[0] ?? 0;
  const ax1 = gp.axes[1] ?? 0;
  const d = { up: b(12) || ax1 < -0.6, down: b(13) || ax1 > 0.6, left: b(14) || ax0 < -0.6, right: b(15) || ax0 > 0.6 };
  for (let i = 2; i < gp.axes.length; i++) {
    const v = gp.axes[i];
    if (typeof v !== "number" || Math.abs(v) > 1.02) continue;
    for (const [hv, hd] of HAT) {
      if (Math.abs(v - hv) < 0.05) {
        for (const dir of hd) d[dir] = true;
      }
    }
  }
  return d;
}

/** Suspend GamepadNav while a capture UI is mounted. */
function useSuspendNav() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("gh-gamepad-capture", { detail: true }));
    return () => {
      window.dispatchEvent(new CustomEvent("gh-gamepad-capture", { detail: false }));
    };
  }, []);
}

/** Run a callback with the first connected gamepad every animation frame. */
function useGamepadFrames(cb: (gp: Gamepad) => void) {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  }, [cb]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const gp = [...(navigator.getGamepads?.() ?? [])].find((p): p is Gamepad => !!p);
      if (gp) ref.current(gp);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

export default function SettingsController() {
  const t = useTranslations("settingsController");
  const [pad, setPad] = useState<PadInfo | null>(null);
  const [map, setMap] = useState<Record<PadAction, number>>(loadMap);
  const [modal, setModal] = useState<"none" | "test" | "setup">("none");
  const [emuLayout, setEmuLayout] = useState(false);
  // Read the per-device rewind pref after mount (localStorage isn't on the server).
  const [rewind, setRewind] = useState(false);
  useEffect(() => setRewind(rewindEnabled()), []);

  // Light detection only (no press capture) so the page never fights nav.
  useEffect(() => {
    let raf = 0;
    let lastId = "";
    const tick = () => {
      const gp = [...(navigator.getGamepads?.() ?? [])].find((p): p is Gamepad => !!p);
      if (gp && gp.id !== lastId) {
        lastId = gp.id;
        setPad({
          index: gp.index,
          id: gp.id,
          mapping: gp.mapping || "non-standard",
          buttons: gp.buttons.length,
          axes: gp.axes.length,
        });
      } else if (!gp && lastId) {
        lastId = "";
        setPad(null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const standard = pad?.mapping === "standard";
  const shortId = pad ? pad.id.replace(/\s*\((?:[^)]*[Vv]endor[^)]*)\)\s*/g, "").trim() : "";

  const bind = (action: PadAction, index: number) => {
    setMap((prev) => {
      const next = { ...prev, [action]: index };
      saveMap(next);
      return next;
    });
  };
  const reset = () => {
    resetMap();
    setMap({ ...DEFAULT_MAP });
    playSound("activate");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <GpSubHeader>{t("connectedController")}</GpSubHeader>
        {pad ? (
          <div className="settings-row">
            <div className="min-w-0">
              <div className="truncate text-[16px] text-body">{shortId || t("controller")}</div>
              <div className="text-xs text-dim">
                {standard ? t("standardMapping") : t("nonStandardMapping")} · {pad.buttons} {t("buttonsLabel")} ·{" "}
                {pad.axes} {t("axesLabel")} · {t("slotLabel")} {pad.index}
              </div>
            </div>
            <div className="rounded-[2px] bg-[#59bf40]/15 px-3 py-1 text-[13px] font-semibold text-[#59bf40]">
              {t("connected")}
            </div>
          </div>
        ) : (
          <GpRow
            label={t("noControllerDetected")}
            description={t("noControllerDesc")}
          />
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <GpButton onClick={() => setModal("test")} disabled={!pad}>
            {t("testButtons")}
          </GpButton>
          <GpButton primary onClick={() => setModal("setup")} disabled={!pad}>
            {t("remapController")}
          </GpButton>
        </div>
      </div>

      <div>
        <GpSubHeader>{t("buttonMapping")}</GpSubHeader>
        {PAD_ACTIONS.map((a) => (
          <div key={a.key} className="settings-row">
            <div className="min-w-0">
              <div className="text-[16px] text-body">{a.label}</div>
              <div className="text-xs text-dim">{a.hint}</div>
            </div>
            <span className="rounded-[2px] bg-white/10 px-3 py-1 text-[14px] font-semibold text-bright">
              {buttonLabel(map[a.key], standard)}
            </span>
          </div>
        ))}
        <p className="mt-2 text-xs text-dim">
          {t("remapHintPrefix")} <span className="text-body">{t("remapController")}</span> {t("remapHintSuffix")}
        </p>
        <div className="mt-3 flex justify-end">
          <GpButton onClick={reset}>{t("resetToDefaults")}</GpButton>
        </div>
      </div>

      <div>
        <GpSubHeader>{t("navigation")}</GpSubHeader>
        <GpRow
          label={t("moveFocus")}
          description={t("moveFocusDesc")}
        />
      </div>

      <div>
        <GpSubHeader>{t("inGame")}</GpSubHeader>
        <GpRow
          label={t("emulatorButtonLayout")}
          description={t("emulatorLayoutDesc")}
        >
          <GpButton primary onClick={() => setEmuLayout(true)}>
            {t("editLayout")}
          </GpButton>
        </GpRow>
        <GpRow
          label={t("movement")}
          description={t("movementDesc")}
        />
        <GpRow
          label={t("rewind")}
          description={t("rewindDesc")}
        >
          <GpToggle
            on={rewind}
            label={t("rewind")}
            onChange={(next) => {
              setRewind(next);
              setRewindEnabled(next);
            }}
          />
        </GpRow>
      </div>

      {modal === "test" && <TestModal standard={standard} onClose={() => setModal("none")} />}
      {modal === "setup" && (
        <SetupWizard map={map} standard={standard} onBind={bind} onClose={() => setModal("none")} />
      )}
      {emuLayout && (
        <ControllerLayout
          scope={{ kind: "global" }}
          title={t("emulatorButtonLayout")}
          onClose={() => setEmuLayout(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Test modal

function TestModal({ standard, onClose }: { standard: boolean; onClose: () => void }) {
  const t = useTranslations("settingsController");
  useSuspendNav();
  const [pressed, setPressed] = useState<boolean[]>([]);
  const [dirs, setDirs] = useState({ up: false, down: false, left: false, right: false });
  const [family, setFamily] = useState<ControllerFamily>("xinput");
  const [active, setActive] = useState<Set<string>>(new Set());
  useGamepadFrames((gp) => {
    const now = gp.buttons.map((b) => b.pressed);
    setPressed((cur) => (cur.length === now.length && cur.every((v, i) => v === now[i]) ? cur : now));
    const d = readDirections(gp);
    setDirs((cur) => (cur.up === d.up && cur.down === d.down && cur.left === d.left && cur.right === d.right ? cur : d));
    const fam = detectFamily(gp.id);
    setFamily((cur) => (cur === fam ? cur : fam));
    // Diagram highlight: pressed buttons + stick movement, plus the D-Pad from
    // the tolerant direction read (covers hat/axis pads too).
    const a = gamepadActiveInputs(gp);
    if (d.up) a.add("dpad-up").add("dpad");
    if (d.down) a.add("dpad-down").add("dpad");
    if (d.left) a.add("dpad-left").add("dpad");
    if (d.right) a.add("dpad-right").add("dpad");
    setActive((cur) => (cur.size === a.size && [...cur].every((x) => a.has(x)) ? cur : a));
  });

  const dirChip = (on: boolean, label: string) => (
    <span
      className={`flex h-9 w-9 items-center justify-center rounded-[4px] text-[13px] font-bold ${
        on ? "bg-accent text-black" : "bg-white/8 text-dim"
      }`}
    >
      {label}
    </span>
  );

  return (
    <GpModal
      title={t("testButtons")}
      width={560}
      onClose={onClose}
      footer={<GpButton primary onClick={onClose}>{t("done")}</GpButton>}
    >
      <p className="mb-4 text-[13px] text-dim">
        {t("testIntro")}
      </p>
      <div className="mb-5 flex justify-center rounded-[6px] bg-black/20 py-3">
        <ControllerWireframe family={family} active={active} className="h-[210px] w-full" />
      </div>
      <div className="mb-5 flex items-center gap-6">
        <div className="grid grid-cols-3 grid-rows-3 gap-1">
          <span />
          {dirChip(dirs.up, "▲")}
          <span />
          {dirChip(dirs.left, "◀")}
          <span className="flex h-9 w-9 items-center justify-center text-[10px] text-dim">{t("dir")}</span>
          {dirChip(dirs.right, "▶")}
          <span />
          {dirChip(dirs.down, "▼")}
          <span />
        </div>
        <div className="flex flex-wrap gap-2">
          {pressed.length === 0 ? (
            <span className="text-xs text-dim">{t("noInputYet")}</span>
          ) : (
            pressed.map((on, i) => (
              <span
                key={i}
                className={`rounded-[3px] px-2 py-1 text-[13px] font-semibold ${
                  on ? "bg-accent text-black" : "bg-white/8 text-dim"
                }`}
              >
                {buttonLabel(i, standard)}
              </span>
            ))
          )}
        </div>
      </div>
    </GpModal>
  );
}

// ------------------------------------------------------------- Remap wizard

/**
 * Walks through every action, auto-advancing as each button is pressed (no
 * "Next"). GamepadNav stays suspended for the whole wizard (useSuspendNav), so
 * ALL controller input is captured here and nothing leaks into the app until
 * it's finished or cancelled.
 */
function SetupWizard({
  map,
  standard,
  onBind,
  onClose,
}: {
  map: Record<PadAction, number>;
  standard: boolean;
  onBind: (action: PadAction, index: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("settingsController");
  useSuspendNav();
  const [step, setStep] = useState(0);
  const [justBound, setJustBound] = useState<number | null>(null);
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  const prev = useRef<boolean[]>([]);
  const armed = useRef(false); // wait for full release before arming a step
  const boundRef = useRef(false); // this step already captured a press
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const advance = () => {
    setJustBound(null);
    boundRef.current = false;
    armed.current = false;
    prev.current = [];
    if (stepRef.current + 1 >= PAD_ACTIONS.length) {
      playSound("confirm");
      onClose();
    } else {
      setStep(stepRef.current + 1);
    }
  };
  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  });
  const skip = () => advanceRef.current();

  useGamepadFrames((gp) => {
    const nowAll = gp.buttons.map((b) => b.pressed);
    // Arm only once everything is released, so the press that bound the previous
    // action (or opened the wizard) can't bind this one.
    if (!armed.current) {
      if (!nowAll.some(Boolean)) armed.current = true;
      prev.current = nowAll;
      return;
    }
    if (!boundRef.current) {
      for (let i = 0; i < gp.buttons.length; i++) {
        if (gp.buttons[i].pressed && !prev.current[i]) {
          boundRef.current = true;
          onBind(PAD_ACTIONS[stepRef.current].key, i);
          playSound("tab");
          setJustBound(i);
          // Brief ✓ confirmation, then auto-advance to the next button.
          timer.current = setTimeout(() => advanceRef.current(), 650);
          break;
        }
      }
    }
    prev.current = nowAll;
  });

  const action = PAD_ACTIONS[step];
  return (
    <GpModal
      title={t("remapController")}
      width={480}
      onClose={onClose}
      footer={
        <>
          <GpButton onClick={onClose}>{t("cancel")}</GpButton>
          <GpButton onClick={skip} disabled={justBound !== null}>
            {t("skip")}
          </GpButton>
        </>
      }
    >
      <div className="py-2 text-center">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-dim">
          {t("stepOf", { current: step + 1, total: PAD_ACTIONS.length })}
        </div>
        <div className="text-[20px] font-bold text-bright">{action.label}</div>
        <div className="mt-1 text-[13px] text-dim">{action.hint}</div>
        <div className="mt-5 flex items-center justify-center">
          {justBound !== null ? (
            <span className="rounded-[4px] bg-accent px-4 py-2 text-[15px] font-bold text-black">
              ✓ {buttonLabel(justBound, standard)}
            </span>
          ) : (
            <span className="animate-pulse rounded-[4px] bg-white/10 px-4 py-2 text-[15px] font-semibold text-body">
              {t("pressButtonPrompt")}
            </span>
          )}
        </div>
        <div className="mt-4 text-xs text-dim">
          {t("currently", { button: buttonLabel(map[action.key], standard) })}
        </div>
      </div>
    </GpModal>
  );
}
