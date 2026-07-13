"use client";

// Steam Big Picture-style on-screen keyboard. When a controller is in use
// (body[data-gamepad="on"]) and a text field takes focus, this docks a QWERTY
// keyboard at the bottom of the screen. Its keys are plain <button>s inside a
// [data-overlay="open"] surface, so GamepadNav drives all the d-pad navigation
// and "A to press" for free — this component only injects the typed characters
// into the target field and owns open/close.
//
// B closes the keyboard rather than navigating back: GamepadNav checks
// body.dataset.osk and fires gh-osk-back instead of goBackSmart while we're up.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

type Field = HTMLInputElement | HTMLTextAreaElement;

// Input types that get the keyboard. Everything else (checkbox, range, file,
// color, date pickers, …) has its own native control and is skipped.
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "email",
  "tel",
  "password",
  "number",
  "",
]);

function isTextField(el: EventTarget | null): el is Field {
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) {
    return !el.disabled && !el.readOnly && TEXT_INPUT_TYPES.has(el.type);
  }
  return false;
}

// React tracks a controlled input's value on the element; to make it notice an
// external edit we must go through the prototype's value setter and fire a
// native "input" event, exactly like a real keystroke.
function setNativeValue(el: Field, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const ROWS_LETTERS = [
  "1234567890".split(""),
  "qwertyuiop".split(""),
  "asdfghjkl".split(""),
  "zxcvbnm".split(""),
];
const ROWS_SYMBOLS = [
  "1234567890".split(""),
  "!@#$%^&*()".split(""),
  "-_=+[]{}\\|".split(""),
  ";:'\"`~,./?".split(""),
];

export default function OnScreenKeyboard() {
  const t = useTranslations("controllerUi.keyboard");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [shift, setShift] = useState(false);
  const [symbols, setSymbols] = useState(false);
  const targetRef = useRef<Field | null>(null);
  const sel = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  function readSelection(el: Field) {
    const len = el.value.length;
    let start = len;
    let end = len;
    try {
      start = el.selectionStart ?? len;
      end = el.selectionEnd ?? len;
    } catch {
      /* number inputs disallow selection reads — append at the end */
    }
    sel.current = { start, end };
  }

  function openFor(el: Field) {
    targetRef.current = el;
    readSelection(el);
    setText(el.value);
    setShift(el.value.length === 0); // start capitalised on an empty field
    setSymbols(false);
    setOpen(true);
  }

  function close() {
    if (!open) return;
    playSound("modalClose");
    setOpen(false);
    const el = targetRef.current;
    targetRef.current = null;
    if (el && el.isConnected) {
      el.focus({ preventScroll: false });
      try {
        const pos = sel.current.start;
        el.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    }
  }

  function applyRange(start: number, end: number, insert: string) {
    const el = targetRef.current;
    if (!el) return;
    const val = el.value;
    const next = val.slice(0, start) + insert + val.slice(end);
    setNativeValue(el, next);
    const pos = start + insert.length;
    sel.current = { start: pos, end: pos };
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      /* ignore (number inputs) */
    }
    setText(el.value);
  }

  function type(char: string) {
    playSound("keyType");
    applyRange(sel.current.start, sel.current.end, char);
    if (shift) setShift(false); // one-shot shift, like a phone keyboard
  }

  function backspace() {
    playSound("keyType");
    const { end } = sel.current;
    let start = sel.current.start;
    if (start === end) {
      if (start === 0) return;
      start -= 1;
    }
    applyRange(start, end, "");
  }

  function moveCaret(delta: number) {
    const el = targetRef.current;
    if (!el) return;
    const pos = Math.max(0, Math.min(el.value.length, sel.current.start + delta));
    sel.current = { start: pos, end: pos };
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      /* ignore */
    }
    playSound("navigate");
  }

  function submit() {
    // "Done" always dismisses (the field already got each keystroke via the
    // native input events); a textarea instead gets a newline so multi-line
    // editing stays possible.
    if (targetRef.current instanceof HTMLTextAreaElement) {
      type("\n");
      return;
    }
    close();
  }

  // Open only when the user presses A on a text field — i.e. a click. The
  // controller's "A" (GamepadNav.activate) fires a synthetic click with no
  // preceding pointerdown; a real mouse/touch click is preceded by one. We
  // ignore the latter so a mouse+keyboard user is never interrupted.
  useEffect(() => {
    const lastPointer = { t: -Infinity };
    const onPointer = () => {
      lastPointer.t = performance.now();
    };
    function onClick(e: MouseEvent) {
      if (document.body.dataset.osk === "open") return;
      if (document.body.dataset.gamepad !== "on") return;
      if (performance.now() - lastPointer.t < 700) return; // real mouse/touch
      const t = e.target;
      if (!isTextField(t)) return;
      if ((t as HTMLElement).closest("[data-osk]")) return;
      openFor(t);
    }
    window.addEventListener("pointerdown", onPointer, { capture: true });
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("pointerdown", onPointer, { capture: true });
      window.removeEventListener("click", onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Controller B (routed here by GamepadNav) and Escape both close.
  useEffect(() => {
    if (!open) return;
    const onBack = () => close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        close();
      }
    };
    window.addEventListener("gh-osk-back", onBack);
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("gh-osk-back", onBack);
      window.removeEventListener("keydown", onKey, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Flag the open keyboard on <body> so GamepadNav can route B / swallow other
  // buttons to us while we're up (kept in an effect to stay off the render path).
  useEffect(() => {
    if (open) document.body.dataset.osk = "open";
    else delete document.body.dataset.osk;
    return () => {
      delete document.body.dataset.osk;
    };
  }, [open]);

  // Move focus onto a key when we open so the d-pad has somewhere to land.
  useEffect(() => {
    if (!open) return;
    const btn = panelRef.current?.querySelector<HTMLButtonElement>("button[data-key]");
    btn?.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  const rows = symbols ? ROWS_SYMBOLS : ROWS_LETTERS;
  const keyClass =
    "btn-gray Focusable flex h-11 min-w-[2.75rem] flex-1 cursor-pointer items-center justify-center px-2 text-[17px]";

  return (
    <div
      data-osk="open"
      data-overlay="open"
      className="fixed inset-x-0 bottom-0 z-[1700] border-t-2 border-black/50 bg-[#1a1d23] px-4 pb-5 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.5)]"
    >
      <div ref={panelRef} className="mx-auto flex max-w-[860px] flex-col gap-1.5">
        {/* current text preview */}
        <div className="mb-1 truncate rounded-[3px] bg-black/40 px-3 py-2 text-[15px] text-body">
          {text ? (
            <span>
              {text}
              <span className="ml-px inline-block h-[1.1em] w-px animate-pulse bg-bright align-middle" />
            </span>
          ) : (
            <span className="text-dim">{t("typeHere")}</span>
          )}
        </div>

        {rows.map((row, i) => (
          <div key={i} className="flex gap-1.5">
            {row.map((k) => {
              const label = shift && !symbols ? k.toUpperCase() : k;
              return (
                <button
                  key={k}
                  data-key
                  onClick={() => type(label)}
                  className={keyClass}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ))}

        {/* function row */}
        <div className="flex gap-1.5">
          <button
            data-key
            onClick={() => {
              playSound("keyType");
              setSymbols((s) => !s);
            }}
            className={`${keyClass} !flex-none min-w-[4.5rem] text-[14px] font-semibold`}
          >
            {symbols ? t("abc") : t("symbols")}
          </button>
          {!symbols && (
            <button
              data-key
              onClick={() => {
                playSound("keyType");
                setShift((s) => !s);
              }}
              className={`${keyClass} !flex-none min-w-[3.75rem] text-[16px] ${shift ? "!bg-white !text-[#0e141b]" : ""}`}
              aria-pressed={shift}
            >
              ⇧
            </button>
          )}
          <button data-key onClick={() => moveCaret(-1)} className={`${keyClass} !flex-none min-w-[3rem]`}>
            ◀
          </button>
          <button data-key onClick={() => type(" ")} className={`${keyClass} flex-[4]`}>
            {t("space")}
          </button>
          <button data-key onClick={() => moveCaret(1)} className={`${keyClass} !flex-none min-w-[3rem]`}>
            ▶
          </button>
          <button data-key onClick={backspace} className={`${keyClass} !flex-none min-w-[4rem]`}>
            ⌫
          </button>
          <button
            data-key
            onClick={submit}
            className="btn-blue Focusable flex h-11 min-w-[5rem] flex-none cursor-pointer items-center justify-center rounded-[2px] px-4 text-[15px] font-semibold"
          >
            {t("done")}
          </button>
        </div>
      </div>
    </div>
  );
}
