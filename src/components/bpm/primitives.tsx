"use client";

// BPM primitives — the reusable building blocks of the from-scratch Big
// Picture clone. Every measurement comes from live captures of Big Picture
// on this machine (refs/steam-captures); the code is original.
//
// These are the ONLY styling primitives new surfaces should use, so the
// whole app stays 1:1 by construction as GameHub features are ported in.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { playSound } from "@/lib/sounds";
import { useIsMobile } from "@/lib/useIsMobile";

/** Standard button: #3d4450 / #dcdedf / radius 2 / 16px / 150ms fade;
 *  controller focus inverts to white via .gpfocus (SteamosShim). */
export function GpButton({
  children,
  onClick,
  primary = false,
  disabled = false,
  className = "",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    // click sound comes from SoundManager's global .DialogButton listener
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        primary ? "btn-blue" : "btn-gray",
        "gamepaddialog_Button_gh DialogButton Focusable cursor-pointer rounded-[2px] px-4 py-2 text-[16px] leading-5 disabled:opacity-40",
        className
      )}
    >
      {children}
    </button>
  );
}

/** Measured settings row: #23262e, radius 2, 12px padding, 64px min height;
 *  16px label + optional 12px description left, control right. */
export function GpRow({
  label,
  description,
  children,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="gamepaddialog_Field_gh gamepaddialog_HighlightOnFocus_gh settings-row">
      <div className="gamepaddialog_FieldLabelRow_gh min-w-0">
        <div className="gamepaddialog_FieldLabel_gh text-[16px] text-body">{label}</div>
        {description && <div className="gamepaddialog_FieldDescription_gh mt-1 text-[12px] text-dim">{description}</div>}
      </div>
      {children && (
        // Steam's REAL control wrapper is FieldChildrenWithIcon > FieldChildrenInner
        // (verified on the Deck), NOT the plain `FieldChildren_`. Themes green
        // `.DialogButton:enabled` / dropdown titles only inside plain
        // `[gamepaddialog_FieldChildren_]` — a rule that never matches real Steam
        // (hence the Deck's buttons/dropdowns stay normal). Using the plain class
        // made GameHub's controls render solid-green; these Inner/WithIcon hooks
        // match the Deck so controls stay normal and only the FOCUSED field greens.
        <div className="gamepaddialog_FieldChildrenWithIcon_gh flex shrink-0 items-center">
          <div className="gamepaddialog_FieldChildrenInner_gh flex items-center">{children}</div>
        </div>
      )}
    </div>
  );
}

/** Compact 47px label/value info row (measured: Steam's About/Hardware rows)
 *  — Field + FieldLabel + LabelFieldValue hooks so themes recolor these like
 *  any other settings row. */
export function GpInfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  // dim default lives on the Field so the value INHERITS it — themes recolor
  // the Field (settings scope has no direct LabelFieldValue rule) and the
  // value must follow; an own text color here would block that.
  return (
    <div className="gamepaddialog_Field_gh settings-row !min-h-[47px] !py-2 text-dim">
      <div className="gamepaddialog_FieldLabel_gh text-[16px] text-body">{label}</div>
      <div className="gamepaddialog_LabelFieldValue_gh text-[14px]">{value}</div>
    </div>
  );
}

/** Measured section subheader: 36px line box, 16px/500, #dcdedf */
export function GpSubHeader({ children }: { children: React.ReactNode }) {
  return <div className="DialogControlsSectionHeader appdetailssectionheader_LabelText_gh bpm-subheader">{children}</div>;
}

/** Measured BPM dropdown: 250x40 field, rgba(255,255,255,.15), radius 2,
 *  10px/16px padding, 16px/400 #dcdedf; custom dark popup menu whose
 *  focused option inverts to white (BPM focus model). */
export function GpDropdown({
  value,
  options,
  onChange,
  width = 250,
  disabled = false,
  title,
}: {
  value: string;
  options: { value: string; label: string; description?: string }[];
  onChange: (value: string) => void;
  width?: number | string;
  disabled?: boolean;
  title?: string;
}) {
  const t = useTranslations("primitives");
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value);
  // On phones the picker slides up as a bottom sheet (matching the cog menus);
  // on desktop/TV it stays the centered Big Picture context menu.
  const isMobile = useIsMobile();

  const close = () => {
    playSound("modalClose");
    setOpen(false);
  };
  const openMenu = () => {
    // Steam centres the picker horizontally on screen and vertically on the
    // control's row; clamp so it stays on-screen.
    const r = btnRef.current?.getBoundingClientRect();
    const cy = r ? r.top + r.height / 2 : window.innerHeight / 2;
    const estH = Math.min((options.length + 1) * 48 + 12, window.innerHeight * 0.86);
    setTop(Math.max(8 + estH / 2, Math.min(cy, window.innerHeight - 8 - estH / 2)));
    playSound("modalOpen");
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        close();
      }
    };
    const onB = (e: Event) => {
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("gh-b", onB);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("gh-b", onB);
    };
  }, [open]);

  // Gamepad focus handoff. On open, land focus on the currently-selected option
  // so the pad is immediately on it (not requiring a stray D-pad press). On
  // close, hand focus back to the trigger — otherwise the option button unmounts,
  // focus falls to <body>, and the next D-pad press jumps to the top of the page.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const menu = document.querySelector('[data-overlay="open"] [role="listbox"]');
      const opt =
        menu?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]') ??
        menu?.querySelector<HTMLElement>('[role="option"]');
      opt?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) btnRef.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  return (
    <div className="gh-dropdown relative max-w-full" style={{ width }} title={title}>
      <button
        ref={btnRef}
        onClick={() => (open ? close() : openMenu())}
        disabled={disabled}
        className={clsx(
          // NOTE: no generic `DialogButton` class here. Steam's dropdown
          // control is a DropDownControlButton, not a plain DialogButton, and
          // themes (e.g. Pip-Boy) green every `.DialogButton:enabled` inside a
          // settings field — which is meant for action buttons, not dropdowns.
          // Tagging the dropdown as DialogButton made it render solid-green on
          // GameHub while the Deck's dropdown stays normal. DialogDropDown +
          // DropDownControlButton keep the dropdown's own theme hooks.
          "gamepaddropdown_DropDownControlButton_gh DialogDropDown Focusable flex h-10 w-full items-center justify-between rounded-[2px] bg-white/15 px-4 py-[10px] text-left text-[16px] leading-5 text-[#dcdedf]",
          disabled ? "gamepaddialog_Disabled_gh cursor-default opacity-50" : "cursor-pointer"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="dropdownlabel_DropDownLabelTitle_gh truncate">{current?.label ?? value}</span>
        <span className="ml-2 text-[10px] opacity-80">▼</span>
      </button>
      {open && (
        // BPM dropdown picker (reference: live Settings→System — a centred
        // gamepadcontextmenu modal over a dimmed page; 280px block of 48px
        // items, 14px pad, 16px; selected #3d4450/white, else #23262e/#b8bcbf;
        // a 2px black separator then a Cancel row).
        <div
          className={clsx(
            "ModalOverlayBackground gamepadui_GamepadDialogOverlay_gh fixed inset-0 z-[1600] bg-black/70 backdrop-blur-[8px]",
            isMobile && "flex flex-col justify-end"
          )}
          onClick={close}
          data-overlay="open"
        >
          <div
            className={clsx(
              "BasicUIContextMenu gamepadcontextmenu_BasicContextMenuModal_gh",
              !isMobile && "absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
            )}
            style={isMobile ? undefined : { top }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              role="listbox"
              className={clsx(
                "gamepadcontextmenu_contextMenuContents_gh basiccontextmenu_contextMenuContents_gh flex flex-col overflow-y-auto overflow-x-hidden shadow-[0_12px_40px_rgba(0,0,0,0.6)]",
                isMobile
                  ? "max-h-[80dvh] w-full rounded-t-[16px] pb-[env(safe-area-inset-bottom,0px)]"
                  : "max-h-[86vh] w-max min-w-[280px] max-w-[92vw] rounded-[3px]"
              )}
            >
              {isMobile && (
                <div className="sticky top-0 flex shrink-0 justify-center bg-[#23262e] pb-1 pt-2">
                  <span className="h-1 w-10 rounded-full bg-white/20" />
                </div>
              )}
              {options.map((o) => (
                <button
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => {
                    playSound("activate");
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={clsx(
                    // stable `contextMenuItem` class → the theme's focus rule
                    // (.contextMenuItem.gpfocus{background:accent}) gives the
                    // green FILL on keyboard focus like the Deck, instead of a
                    // stray generic focus outline.
                    "contextMenuItem gamepadcontextmenu_contextMenuItem_gh basiccontextmenu_contextMenuItem_gh Focusable flex min-h-[48px] w-full cursor-pointer flex-col justify-center px-[14px] py-2 text-left text-[16px] leading-tight",
                    o.value === value
                      ? "gamepadcontextmenu_Selected_gh basiccontextmenu_Selected_gh bg-[#3d4450] text-white"
                      : "bg-[#23262e] text-[#b8bcbf] hover:bg-[#3d4450] hover:text-white"
                  )}
                >
                  <span className="dropdownlabel_DropDownLabelTitle_gh">{o.label}</span>
                  {o.description && (
                    <span className="dropdownlabel_DropDownLabelDescription_gh mt-0.5 text-[12px] text-dim">
                      {o.description}
                    </span>
                  )}
                </button>
              ))}
              <div className="gamepadcontextmenu_ContextMenuSeparator_gh h-[2px] w-full shrink-0 bg-black" aria-hidden />
              <button
                onClick={close}
                className="contextMenuItem gamepadcontextmenu_contextMenuItem_gh basiccontextmenu_contextMenuItem_gh Focusable flex min-h-[48px] w-full shrink-0 cursor-pointer items-center bg-[#23262e] px-[14px] text-left text-[16px] text-[#b8bcbf] hover:bg-[#3d4450] hover:text-white"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Toggle visual — Steam's structure: a Toggle container holding a
 *  ToggleRail (track) and a knob, with On stamped when active, so themes
 *  can restyle track and knob independently. Presentational only. */
export function GpSwitch({ on }: { on: boolean }) {
  return (
    <span
      className={clsx("switch gamepaddialog_Toggle_gh", on && "gamepaddialog_On_gh")}
      data-on={on}
      aria-hidden
    >
      <span className="switch-rail gamepaddialog_ToggleRail_gh" />
      <span className="switch-knob gamepaddialog_ToggleSwitch_gh" />
    </span>
  );
}

/** Measured toggle (unchanged geometry from the shipped switch style) */
export function GpToggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => {
        playSound(on ? "toggleOff" : "toggleOn");
        onChange(!on);
      }}
      className="Focusable cursor-pointer"
    >
      <GpSwitch on={on} />
    </button>
  );
}

/** Steam progress bar — the app-details install-progress structure
 *  (DetailsProgressContainer > DetailsProgressBar) so themes recolor every
 *  progress surface the same way. value is 0..100. */
export function GpProgress({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return (
    <div
      className={`appdetailsplaysection_DetailsProgressContainer_gh h-2 w-full overflow-hidden rounded bg-black/40 ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <div
        className="appdetailsplaysection_DetailsProgressBar_gh h-full rounded bg-gradient-to-r from-[#47bfff] to-[#1a44c2] transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/** Steam slider — REAL div structure (not a native range input, whose
 *  internals themes can't reach): SliderControl carries
 *  --normalized-slider-value (Steam's variable contract), SliderTrack's
 *  ::before is the fill layer themes recolor, SliderHandle is the knob,
 *  optional SliderNotchTick row with TickActive below. Pointer drag,
 *  track click, and arrow keys; onChange fires live, onCommit on release. */
export function GpSlider({
  value,
  onChange,
  onCommit,
  min = 0,
  max = 1,
  step = 0.01,
  width = 224,
  notches,
  label,
}: {
  value: number;
  onChange?: (v: number) => void;
  onCommit?: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  width?: number;
  notches?: number;
  label?: string;
}) {
  const [v, setV] = useState(value);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  useEffect(() => setV(value), [value]);
  const norm = max > min ? (v - min) / (max - min) : 0;

  function fromClientX(clientX: number): number {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width === 0) return v;
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const raw = min + frac * (max - min);
    const stepped = Math.round(raw / step) * step;
    return Math.min(max, Math.max(min, Number(stepped.toFixed(6))));
  }

  function update(next: number) {
    setV(next);
    onChange?.(next);
  }

  return (
    <div
      className="gamepadslider_SliderControlAndNotches_gh Focusable"
      style={{ width }}
      tabIndex={0}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={v}
      onKeyDown={(e) => {
        let next: number | null = null;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(min, v - step);
        if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(max, v + step);
        if (e.key === "Home") next = min;
        if (e.key === "End") next = max;
        if (next !== null) {
          e.preventDefault();
          playSound("navigate");
          update(next);
          onCommit?.(next);
        }
      }}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(fromClientX(e.clientX));
      }}
      onPointerMove={(e) => {
        if (dragging.current) update(fromClientX(e.clientX));
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        const next = fromClientX(e.clientX);
        update(next);
        onCommit?.(next);
      }}
    >
      <div
        className="gamepadslider_SliderControl_gh gh-slider"
        style={{ "--normalized-slider-value": norm } as React.CSSProperties}
      >
        <div ref={track} className="gamepadslider_SliderTrack_gh gh-slider-track" />
        <div className="gamepadslider_SliderHandleContainer_gh gh-slider-handles">
          <div className="gamepadslider_SliderHandle_gh gh-slider-handle" />
        </div>
      </div>
      {notches !== undefined && notches > 1 && (
        <div className="gamepadslider_SliderNotchContainer_gh gh-slider-notches" aria-hidden>
          {Array.from({ length: notches }, (_, i) => {
            const at = min + (i / (notches - 1)) * (max - min);
            return (
              <div
                key={i}
                className={`gamepadslider_SliderNotchTick_gh gh-slider-notch ${
                  at <= v + step / 2 ? "gamepadslider_TickActive_gh gh-slider-notch-active" : ""
                }`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Steam submenu/dialog (reference: refs/steam-captures/dialog.png): a
 *  centered dark panel over the dimmed+blurred page, with a title, scrollable
 *  body, and a footer action row. Dismissed by the backdrop, Escape, or the
 *  controller B button (gh-b). */
export function GpModal({
  title,
  onClose,
  children,
  footer,
  width = 720,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const close = () => {
      playSound("modalClose");
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        close();
      }
    };
    const onB = (e: Event) => {
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("gh-b", onB);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("gh-b", onB);
    };
  }, [onClose]);

  // Steam's real fullscreen-modal DOM (themes scope every dialog rule to it):
  //   .ModalOverlayBackground > .ModalOverlayContent
  //     > gamepaddialog_ModalPosition
  //       > gamepaddialog_GamepadDialogContent.GenericConfirmDialog  (the panel)
  // ModalOverlayContent is display:contents — a pure DOM/theming hook, so
  // backdrop clicks still fall through to close.
  return (
    <div
      className="ModalOverlayBackground gamepadui_GamepadDialogOverlay_gh fixed inset-0 z-[1600] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[8px] sm:p-6"
      onClick={onClose}
      data-overlay="open"
    >
      <div className="ModalOverlayContent" style={{ display: "contents" }}>
        <div
          className="gamepaddialog_ModalPosition_gh w-full"
          style={{ maxWidth: width }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="gamepaddialog_GamepadDialogContent_gh GenericConfirmDialog DialogContent flex max-h-[86vh] w-full flex-col bg-[#23262e] shadow-2xl">
            <div className="DialogHeader shrink-0 px-6 pb-4 pt-5 text-[24px] font-bold text-bright">
              {title}
            </div>
            <div className="DialogBody DialogBodyText min-h-0 flex-1 overflow-y-auto px-6 pb-2">
              {children}
            </div>
            {footer && (
              <div className="flex shrink-0 items-center justify-end gap-3 border-t-2 border-black/40 px-6 py-4">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Steam confirm dialog — replaces browser confirm(), which Steam never
 *  shows. Renders a GpModal with Cancel + a (optionally destructive)
 *  confirm action. */
export function GpConfirm({
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("primitives");
  return (
    <GpModal
      title={title}
      width={520}
      onClose={onClose}
      footer={
        <>
          <GpButton onClick={onClose}>{t("cancel")}</GpButton>
          <GpButton
            primary={!danger}
            onClick={() => {
              onClose();
              onConfirm();
            }}
            className={danger ? "!bg-[#a33a3a] hover:!bg-[#c04545]" : ""}
          >
            {confirmLabel ?? t("confirm")}
          </GpButton>
        </>
      }
    >
      {children && <div className="text-[15px] leading-relaxed text-body">{children}</div>}
    </GpModal>
  );
}

/** Steam "Library Filters" dialog (reference: live BPM library FILTER panel).
 *  A dark #0e141b panel bordered in #23262e over the blurred grid; a big title
 *  + subtitle, then scrollable filter sections. The whole panel scrolls (title
 *  included), exactly as Steam does. Closed by backdrop / Escape / controller B. */
export function GpFilterDialog({
  title,
  subtitle,
  onClose,
  headerAction,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const close = () => {
      playSound("modalClose");
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        close();
      }
    };
    const onB = (e: Event) => {
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("gh-b", onB);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("gh-b", onB);
    };
  }, [onClose]);

  return (
    <div
      className="ModalOverlayBackground gamepadui_GamepadDialogOverlay_gh fixed inset-0 z-[1600] flex items-start justify-center overflow-y-auto bg-black/60 py-[4vh] backdrop-blur-[8px]"
      onClick={onClose}
      data-overlay="open"
    >
      <div className="ModalOverlayContent" style={{ display: "contents" }}>
        <div
          className="gamepaddialog_ModalPosition_gh steamdeckcompatfilter_DialogWrapper_gh w-full"
          style={{ maxWidth: 660 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Carry the generic dialog hooks (GamepadDialogContent + GenericConfirmDialog)
              in ADDITION to the exact filter class, so themes that style fullscreen
              modals recolour the frame/title/buttons. */}
          <div className="gamepaddialog_GamepadDialogContent_gh GenericConfirmDialog steamdeckcompatfilter_CompatFilterDialog_gh gh-filter-dialog">
            <div className="DialogHeader flex items-start justify-between gap-4 text-bright">
              <div className="min-w-0">
                {/* no own text colour → inherits DialogHeader (themable) */}
                <div className="text-[26px] font-bold leading-tight">{title}</div>
                {subtitle && (
                  <div className="mt-2 max-w-[520px] text-[15px] leading-snug text-dim">
                    {subtitle}
                  </div>
                )}
              </div>
              {headerAction && <div className="shrink-0 pt-1">{headerAction}</div>}
            </div>
            <div className="mt-5 flex flex-col gap-3">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One filter section (reference: appfilterpane FilterBucket): a #23262e card
 *  with an 18px/500 header and its rows below. */
export function GpFilterSection({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="appfilterpane_FilterBucket_gh gh-filter-bucket">
      <div className="appfilterpane_FilterBucketLabel_gh text-[18px] font-medium leading-8 text-bright">
        {label}
      </div>
      <div className="appfilterpane_FilterBucketBoxes_gh flex flex-col">{children}</div>
    </div>
  );
}

/** Steam checkbox row (reference: DialogCheckbox inside appfilterpane Row):
 *  16px box, 2px radius, dark fill; checked fills with the accent + a check. */
export function GpCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
}) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      onClick={() => {
        playSound(checked ? "toggleOff" : "toggleOn");
        onChange(!checked);
      }}
      className="appfilterpane_Row_gh DialogCheckbox_Container_gh Focusable flex w-full cursor-pointer items-center gap-2.5 rounded-[2px] px-3 py-[3px] text-left hover:bg-white/5"
    >
      <span
        className={clsx(
          "DialogCheckbox_gh gh-checkbox flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px]",
          checked && "gh-checkbox-on"
        )}
      >
        {checked && (
          <svg viewBox="0 0 24 24" className="SVGIcon_DialogCheck h-3.5 w-3.5" aria-hidden>
            <path
              d="M5 13l4 4L19 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="DialogToggle_Label_gh text-[15px] text-body">{label}</span>
    </button>
  );
}

/** Steam radio row (reference: steamdeckcompatfilter CompatFilterDialogRow):
 *  a hollow ring that fills with the accent + inner dot when selected, a label
 *  and optional description. */
export function GpRadioRow({
  selected,
  onSelect,
  label,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={() => {
        playSound("navigate");
        onSelect();
      }}
      className={clsx(
        "steamdeckcompatfilter_CompatFilterDialogRow_gh Focusable flex w-full cursor-pointer items-center gap-3 rounded-[2px] px-3 py-2 text-left hover:bg-white/5",
        selected && "steamdeckcompatfilter_Selected_gh"
      )}
    >
      <span
        className={clsx(
          "steamdeckcompatfilter_RadioButton_gh gh-radio shrink-0",
          selected && "gh-radio-on"
        )}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="steamdeckcompatfilter_CompatFilterLabel_gh block text-[16px] text-body">
          {label}
        </span>
        {description && (
          <span className="steamdeckcompatfilter_CompatFilterDescription_gh mt-0.5 block text-[13px] leading-snug text-dim">
            {description}
          </span>
        )}
      </span>
    </button>
  );
}

/** Measured pill tab: radius 64, 6px/16px padding, 12px/700 uppercase */
export function GpPill({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      className={clsx("pill-tab gamepadtabbedpage_Tab_gh Focusable", active && "gamepadtabbedpage_Selected_gh")}
      data-active={active}
      onClick={() => {
        playSound("tab");
        onClick();
      }}
    >
      <span className="gamepadtabbedpage_TabTitle_gh">{children}</span>
      {count !== undefined && <span className="gamepadtabbedpage_TabCount_gh ml-2 opacity-80">{count.toLocaleString()}</span>}
    </button>
  );
}
