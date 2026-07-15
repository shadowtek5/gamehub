"use client";

// Steam Deck / Big Picture-style emulator controller mapping. A controller
// diagram with each remappable physical input labelled by the console
// (RetroPad) button it emits; click an input to rebind it, and inputs light up
// live as you press them. Self-contained: fetches + persists its own scope
// (global-per-family / per-system / per-game) via /api/account/controller-layout.
// Directions (D-Pad + sticks for movement) are fixed and shown for reference.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { GpButton, GpModal } from "@/components/bpm/primitives";
import { playSound } from "@/lib/sounds";
import {
  CONSOLE_BUTTONS,
  CONSOLE_LABEL,
  FAMILY_NAMES,
  PHYSICAL_INPUTS,
  defaultLayout,
  detectFamily,
  physicalLabel,
  encodeLayoutCode,
  decodeLayoutCode,
  type ConsoleButton,
  type ControllerFamily,
  type Layout,
  type PhysicalInput,
  type PhysicalKey,
} from "@/lib/controllerLayout";

const FAMILY_TABS: ControllerFamily[] = ["xinput", "playstation", "nintendo", "generic"];

/** The change event the emulator listens for to hot-reload a live layout. */
export const LAYOUT_EVENT = "gh-emu-layout";

export type LayoutScope =
  | { kind: "global" }
  | { kind: "system"; slug: string }
  | { kind: "game"; romId: number };

interface Overrides {
  global: Layout | null;
  system: Layout | null;
  game: Layout | null;
}

/** The layout this scope inherits when it has no override of its own. */
function inheritedFor(scope: LayoutScope, o: Overrides, family: ControllerFamily): Layout {
  const def = defaultLayout(family);
  if (scope.kind === "global") return def;
  if (scope.kind === "system") return o.global ?? def;
  return o.system ?? o.global ?? def;
}

function overrideFor(scope: LayoutScope, o: Overrides): Layout | null {
  return o[scope.kind];
}

export default function ControllerLayout({
  scope,
  title,
  onClose,
}: {
  scope: LayoutScope;
  title: string;
  onClose: () => void;
}) {
  const t = useTranslations("controllerUi.layout");
  // Detected pad → family. For the global scope the family is user-selectable
  // (tabs); for system/game it only drives the on-diagram labels.
  const [detected, setDetected] = useState<{ id: string; family: ControllerFamily; standard: boolean } | null>(null);
  const [family, setFamily] = useState<ControllerFamily>("xinput");
  const familyPinned = useRef(false); // once the user picks a tab, stop auto-following

  const [overrides, setOverrides] = useState<Overrides>({ global: null, system: null, game: null });
  const [layout, setLayout] = useState<Layout | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState<PhysicalKey | null>(null);
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  // Share (export/import) UI state.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCode, setShareCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [importCode, setImportCode] = useState("");
  const [importErr, setImportErr] = useState(false);

  // Suspend app-nav so presses land here, not in the grid behind (no-op in the
  // emulator, where GamepadNav isn't mounted).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("gh-gamepad-capture", { detail: true }));
    return () => {
      window.dispatchEvent(new CustomEvent("gh-gamepad-capture", { detail: false }));
    };
  }, []);

  // Detect the connected controller and light up pressed buttons. The layout
  // auto-switches to the detected controller's type until the user pins a tab.
  useEffect(() => {
    // Switch immediately on connect (the poll below also covers pads that were
    // already connected once they send their first input).
    const onConnect = (e: GamepadEvent) => {
      const fam = detectFamily(e.gamepad.id);
      setDetected({ id: e.gamepad.id, family: fam, standard: e.gamepad.mapping === "standard" });
      if (!familyPinned.current) setFamily(fam);
    };
    window.addEventListener("gamepadconnected", onConnect);

    let raf = 0;
    const tick = () => {
      const gp = [...(navigator.getGamepads?.() ?? [])].find((p): p is Gamepad => !!p);
      if (gp) {
        const fam = detectFamily(gp.id);
        setDetected((cur) =>
          cur && cur.id === gp.id ? cur : { id: gp.id, family: fam, standard: gp.mapping === "standard" }
        );
        if (!familyPinned.current) setFamily((cur) => (cur === fam ? cur : fam));
        const now = new Set<number>();
        gp.buttons.forEach((b, i) => b.pressed && now.add(i));
        setPressed((cur) => (sameSet(cur, now) ? cur : now));
      } else {
        setDetected((cur) => (cur ? null : cur));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("gamepadconnected", onConnect);
    };
  }, []);

  const query = useCallback(() => {
    const q = new URLSearchParams({ family });
    if (scope.kind === "system") q.set("slug", scope.slug);
    if (scope.kind === "game") q.set("romId", String(scope.romId));
    return q.toString();
  }, [family, scope]);

  // Load this scope's override + inherited layers whenever the family changes.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/account/controller-layout?${query()}`, { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        const o: Overrides = data.overrides ?? { global: null, system: null, game: null };
        setOverrides(o);
        setLayout(overrideFor(scope, o) ?? inheritedFor(scope, o, family));
        setDirty(false);
      } catch {
        if (alive) setLayout(defaultLayout(family));
      }
    })();
    return () => {
      alive = false;
    };
  }, [query, scope, family]);

  const hasOverride = !!overrideFor(scope, overrides);
  const inherited = inheritedFor(scope, overrides, family);

  function rebind(key: PhysicalKey, button: ConsoleButton) {
    setLayout((cur) => (cur ? { ...cur, [key]: button } : cur));
    setDirty(true);
    setPicking(null);
    playSound("tab");
  }

  async function save() {
    if (!layout) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { scope: scope.kind, family, layout };
      if (scope.kind === "system") body.slug = scope.slug;
      if (scope.kind === "game") body.romId = scope.romId;
      const res = await fetch("/api/account/controller-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setOverrides((o) => ({ ...o, [scope.kind]: data.layout }));
        setDirty(false);
        playSound("confirm");
        window.dispatchEvent(new Event(LAYOUT_EVENT));
      }
    } finally {
      setSaving(false);
    }
  }

  // Share codes: export the current layout to a copyable code, or paste one in.
  function exportCode() {
    if (!layout) return;
    const code = encodeLayoutCode(layout);
    if (!code) return;
    void navigator.clipboard?.writeText(code).then(
      () => setCopied(true),
      () => setCopied(false)
    );
    setShareCode(code);
    setShareOpen(true);
    setImportErr(false);
    playSound("tab");
  }
  function applyImport() {
    const parsed = decodeLayoutCode(importCode);
    if (!parsed) {
      setImportErr(true);
      return;
    }
    setLayout(parsed);
    setDirty(true);
    setImportErr(false);
    setImportCode("");
    setShareOpen(false);
    playSound("confirm");
  }

  async function resetToInherited() {
    setSaving(true);
    try {
      const q = new URLSearchParams({ scope: scope.kind, family });
      if (scope.kind === "system") q.set("slug", scope.slug);
      if (scope.kind === "game") q.set("romId", String(scope.romId));
      await fetch(`/api/account/controller-layout?${q.toString()}`, { method: "DELETE" });
      const o = { ...overrides, [scope.kind]: null } as Overrides;
      setOverrides(o);
      setLayout(inheritedFor(scope, o, family));
      setDirty(false);
      playSound("back");
      window.dispatchEvent(new Event(LAYOUT_EVENT));
    } finally {
      setSaving(false);
    }
  }

  const scopeNote =
    scope.kind === "global"
      ? t("scopeNoteGlobal")
      : scope.kind === "system"
        ? t("scopeNoteSystem")
        : t("scopeNoteGame");

  return (
    <GpModal
      title={title}
      width={940}
      onClose={onClose}
      footer={
        <>
          <GpButton onClick={onClose}>{t("close")}</GpButton>
          <GpButton onClick={() => { setShareOpen((v) => !v); setCopied(false); setImportErr(false); }}>
            {t("share")}
          </GpButton>
          <GpButton onClick={resetToInherited} disabled={saving || !hasOverride}>
            {scope.kind === "global" ? t("resetToDefault") : t("resetToInherited")}
          </GpButton>
          <GpButton primary onClick={save} disabled={saving || !dirty || !layout}>
            {saving ? t("saving") : t("saveLayout")}
          </GpButton>
        </>
      }
    >
      {/* Share panel: export the current layout as a code, or paste one to apply. */}
      {shareOpen && (
        <div className="mb-4 rounded-[6px] bg-[#12161c] p-4 ring-1 ring-white/10">
          <div className="mb-3">
            <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-dim">{t("exportHeading")}</div>
            <div className="flex flex-wrap items-center gap-2">
              <GpButton onClick={exportCode} disabled={!layout}>{t("copyCode")}</GpButton>
              {shareCode && (
                <input
                  readOnly
                  value={shareCode}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-[3px] bg-black/40 px-2 py-1.5 text-[12px] text-body outline-none ring-1 ring-white/10"
                />
              )}
              {copied && <span className="text-[12px] text-accent">{t("copied")}</span>}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-dim">{t("importHeading")}</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={importCode}
                onChange={(e) => { setImportCode(e.target.value); setImportErr(false); }}
                placeholder={t("pastePlaceholder")}
                className="min-w-0 flex-1 rounded-[3px] bg-black/40 px-2 py-1.5 text-[12px] text-bright outline-none ring-1 ring-white/10 placeholder:text-dim focus:ring-2 focus:ring-white"
              />
              <GpButton primary onClick={applyImport} disabled={!importCode.trim()}>{t("applyCode")}</GpButton>
            </div>
            {importErr && <div className="mt-1.5 text-[12px] text-[#e5544b]">{t("importInvalid")}</div>}
            <div className="mt-1.5 text-[11px] text-dim">{t("importNote")}</div>
          </div>
        </div>
      )}
      {/* Status + family selector */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-dim">
          {detected ? (
            <>
              <span className="text-body">{shortId(detected.id)}</span>
              {!detected.standard && (
                <span className="ml-2 rounded-[3px] bg-[#e0a23c]/15 px-2 py-0.5 text-[11px] font-semibold text-[#e0a23c]">
                  {t("nonStandard")}
                </span>
              )}
            </>
          ) : (
            t("noController")
          )}
        </div>
        {/* Controller type — a layout applies to this specific type. Auto-
            follows the connected pad until the user pins a tab. */}
        <div className="flex overflow-hidden rounded-[3px] ring-1 ring-white/10">
          {FAMILY_TABS.map((f) => (
            <button
              key={f}
              onClick={() => {
                familyPinned.current = true;
                setFamily(f);
                playSound("tab");
              }}
              className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                family === f ? "bg-accent text-black" : "bg-white/[0.04] text-dim hover:text-body"
              }`}
            >
              {FAMILY_NAMES[f]}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-[12px] leading-relaxed text-dim">
        {scopeNote} {hasOverride ? "" : t("inheritsNote")}
      </p>

      {!layout ? (
        <div className="py-16 text-center text-sm text-dim">{t("loading")}</div>
      ) : (
        <>
          {/* Top: left bindings · controller art · right bindings */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="flex flex-col gap-2">
              {inputsIn("left").map((p) => (
                <Bind key={p.key} p={p} align="right" {...bindProps(p)} />
              ))}
            </div>
            <ControllerArt family={family} />
            <div className="flex flex-col gap-2">
              {inputsIn("right").map((p) => (
                <Bind key={p.key} p={p} align="left" {...bindProps(p)} />
              ))}
            </div>
          </div>

          {/* Bottom: the four Steam-style sections */}
          <div className="mt-6 grid grid-cols-2 gap-6 border-t border-white/10 pt-5 sm:grid-cols-4">
            <Section title={t("leftJoystick")}>
              <Fixed label={t("joystick")} hint={t("movementFixed")} />
              {inputsIn("leftStick").map((p) => (
                <Bind key={p.key} p={p} align="left" {...bindProps(p)} />
              ))}
            </Section>
            <Section title={t("directionalPad")}>
              <Fixed label={t("dpadDirections")} hint={t("movementFixed")} />
            </Section>
            <Section title={t("rightJoystick")}>
              <Fixed label={t("joystick")} hint={t("movementFixed")} />
              {inputsIn("rightStick").map((p) => (
                <Bind key={p.key} p={p} align="left" {...bindProps(p)} />
              ))}
            </Section>
            <Section title={t("faceButtons")}>
              {inputsIn("face").map((p) => (
                <Bind key={p.key} p={p} align="left" {...bindProps(p)} />
              ))}
            </Section>
          </div>
        </>
      )}
    </GpModal>
  );

  // ---- helpers bound to render scope ----
  function bindProps(p: PhysicalInput) {
    const value = layout![p.key];
    return {
      family,
      value,
      inherited: !hasOverride || value === inherited[p.key],
      down: pressed.has(p.index),
      open: picking === p.key,
      onToggle: () => setPicking((cur) => (cur === p.key ? null : p.key)),
      onPick: (b: ConsoleButton) => rebind(p.key, b),
    };
  }
}

function inputsIn(region: PhysicalInput["region"]): PhysicalInput[] {
  return PHYSICAL_INPUTS.filter((p) => p.region === region);
}

function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// Standard Gamepad button index → the diagram data-in ids to light up. Combined
// elements get both ids (e.g. Xbox's single "bumpers" for LB/RB; single "dpad"
// for controllers without per-direction art).
const INDEX_EXPAND: Record<number, string[]> = {
  0: ["south"], 1: ["east"], 2: ["west"], 3: ["north"],
  4: ["lb", "bumpers"], 5: ["rb", "bumpers"], 6: ["lt"], 7: ["rt"],
  8: ["select"], 9: ["start"], 10: ["lstick"], 11: ["rstick"],
  12: ["dpad-up", "dpad"], 13: ["dpad-down", "dpad"],
  14: ["dpad-left", "dpad"], 15: ["dpad-right", "dpad"], 16: ["guide"],
};

/** The set of diagram data-in ids currently active on a pad — pressed buttons
 *  (expanded to combined elements) plus stick movement. Used to light up the
 *  wireframe in the controller tester. */
export function gamepadActiveInputs(gp: Gamepad): Set<string> {
  const s = new Set<string>();
  gp.buttons.forEach((b, i) => {
    if (b.pressed) (INDEX_EXPAND[i] ?? []).forEach((id) => s.add(id));
  });
  if (Math.hypot(gp.axes[0] ?? 0, gp.axes[1] ?? 0) > 0.5) s.add("lstick");
  if (Math.hypot(gp.axes[2] ?? 0, gp.axes[3] ?? 0) > 0.5) s.add("rstick");
  return s;
}

function shortId(id: string): string {
  return id.replace(/\s*\((?:[^)]*[Vv]endor[^)]*)\)\s*/g, "").trim() || "Controller";
}

// ---------------------------------------------------------------- sub-views

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-dim">{title}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Fixed({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-[4px] bg-white/[0.03] px-3 py-2">
      <div className="text-[13px] text-body">{label}</div>
      <div className="text-[11px] text-dim">{hint}</div>
    </div>
  );
}

function Bind({
  p,
  family,
  value,
  inherited,
  down,
  open,
  align,
  onToggle,
  onPick,
}: {
  p: PhysicalInput;
  family: ControllerFamily;
  value: ConsoleButton;
  inherited: boolean;
  down: boolean;
  open: boolean;
  align: "left" | "right";
  onToggle: () => void;
  onPick: (b: ConsoleButton) => void;
}) {
  const t = useTranslations("controllerUi.layout");
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`flex w-full items-center gap-2 rounded-[4px] px-2.5 py-2 text-left ring-1 transition-colors ${
          down ? "bg-accent/20 ring-accent/70" : "bg-white/[0.05] ring-white/10 hover:bg-white/[0.09]"
        } ${align === "right" ? "flex-row-reverse text-right" : ""}`}
        title={t("bind", { label: physicalLabel(p.key, family) })}
      >
        {/* physical input chip */}
        <span className="flex h-7 min-w-[28px] shrink-0 items-center justify-center rounded-[4px] bg-black/40 px-1.5 text-[12px] font-bold text-bright ring-1 ring-white/10">
          {physicalLabel(p.key, family)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-dim">{p.label}</span>
        {/* what it emits */}
        <span
          className={`shrink-0 rounded-[3px] px-2 py-0.5 text-[12px] font-semibold ${
            value === "none"
              ? "bg-white/5 text-dim"
              : inherited
                ? "bg-white/10 text-body"
                : "bg-accent/20 text-accent"
          }`}
        >
          {CONSOLE_LABEL[value]}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[1]" onClick={onToggle} />
          <div
            className={`absolute z-[2] mt-1 grid w-[220px] grid-cols-3 gap-1 rounded-[4px] bg-[#20262e] p-2 shadow-2xl ring-1 ring-white/10 ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {CONSOLE_BUTTONS.map((c) => (
              <button
                key={c.key}
                onClick={() => onPick(c.key)}
                className={`rounded-[3px] px-2 py-1.5 text-[12px] font-semibold transition-colors ${
                  value === c.key
                    ? "bg-accent text-black"
                    : "bg-white/[0.04] text-body hover:bg-white/10"
                } ${c.key === "none" ? "col-span-3 text-dim" : ""}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Wireframe controller diagrams (outlines that keep every button, symbol and
// brand logo) generated by scripts/wireify-controllers.mjs from the detailed
// AL2009man/Gamepad-Asset-Pack art (MIT — see public/controllers/NOTICE.md).
const ART_SRC: Record<ControllerFamily, string> = {
  xinput: "/controllers/xbox.wire.svg",
  generic: "/controllers/xbox.wire.svg",
  playstation: "/controllers/playstation.wire.svg",
  nintendo: "/controllers/nintendo.wire.svg",
};

const HIT_COLOR = "#1a9fff"; // accent used to light up a pressed input

/** Inlined controller wireframe. The art uses currentColor, so the box sets the
 *  base grey; when `active` is given, matching data-in elements are recoloured
 *  to the accent (used by the controller tester). Fixed-size box so switching
 *  families doesn't rubber-band the layout. */
export function ControllerWireframe({
  family,
  active,
  className = "h-[240px] w-[380px]",
}: {
  family: ControllerFamily;
  active?: Set<string>;
  className?: string;
}) {
  const [svg, setSvg] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setSvg("");
    fetch(ART_SRC[family])
      .then((r) => r.text())
      .then((t) => {
        // Strip the XML prolog/comments — inlining into an HTML container.
        const i = t.indexOf("<svg");
        if (alive) setSvg(i >= 0 ? t.slice(i) : t);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [family]);

  // Light up active inputs (direct DOM — no React re-render of the big SVG).
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll<SVGElement>("[data-in]").forEach((el) => {
      el.style.color = active?.has(el.getAttribute("data-in") || "") ? HIT_COLOR : "";
    });
  }, [active, svg]);

  return (
    <div
      ref={ref}
      className={`flex max-w-full items-center justify-center [&>svg]:h-full [&>svg]:w-full ${className}`}
      style={{ color: "#aab2be" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Editor diagram: the wireframe (static) + the family name. */
function ControllerArt({ family }: { family: ControllerFamily }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <ControllerWireframe family={family} />
      <div className="text-[11px] text-dim">{FAMILY_NAMES[family]}</div>
    </div>
  );
}
