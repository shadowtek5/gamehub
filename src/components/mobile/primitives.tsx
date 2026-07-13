"use client";

// Shared mobile bottom-sheet primitives. The touch UI uses a slide-up sheet
// (not the desktop Big Picture fly-out modal); centralising the shell, rows,
// section headers and footer button here keeps every sheet identical.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

/** Overlay + slide-up panel + grab handle. Callers keep their own `open`
 *  state and render the sheet content (menu / sub-views) as children. */
export function MobileSheet({
  onClose,
  zIndex = 80,
  children,
}: {
  onClose: () => void;
  /** Stacking order — options sheets sit at 80, in-page filters at 60. */
  zIndex?: number;
  children: ReactNode;
}) {
  // Portal to <body>. Some callers live inside a `fixed`, `backdrop-blur`
  // ancestor (the mobile top bar) — and backdrop-filter/transform make an
  // element the containing block for its `position: fixed` descendants, which
  // would trap this full-screen sheet inside that tiny bar. Rendering at body
  // level keeps `fixed inset-0` relative to the viewport.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const sheet = (
    <div className="fixed inset-0 flex flex-col justify-end" style={{ zIndex }} role="dialog">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative max-h-[85dvh] overflow-y-auto rounded-t-[16px] bg-[#161b22] pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-2 ring-1 ring-white/10">
        <div className="mx-auto mb-2 mt-1 h-1 w-10 rounded-full bg-white/20" />
        {children}
      </div>
    </div>
  );

  return mounted ? createPortal(sheet, document.body) : null;
}

/** A tappable row inside a sheet — a link when `href` is set, else a button.
 *  `danger` colours it red, `disabled` dims it. */
export function SheetRow({
  onClick,
  href,
  danger,
  disabled,
  children,
}: {
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls = `flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] active:bg-white/5 disabled:opacity-40 ${
    danger ? "text-[#e0685f]" : "text-body"
  }`;
  return href ? (
    <a href={href} className={cls}>
      {children}
    </a>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

/** Uppercase section label between groups of rows. `divider` draws the top
 *  rule used to separate an "Admin" group from the common actions. */
export function SheetSection({
  children,
  divider = false,
}: {
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className={`px-5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-dim ${
        divider ? "mt-1 border-t border-white/5" : ""
      }`}
    >
      {children}
    </div>
  );
}

/** The full-width "Close" button that ends an options sheet. */
export function SheetCloseButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("mobileMisc");
  return (
    <div className="mt-1 border-t border-white/5 px-4 pt-3">
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-[8px] bg-[#232a34] py-3 text-[15px] font-semibold text-body active:opacity-90"
      >
        {t("primitives.close")}
      </button>
    </div>
  );
}

/** Back link at the top of a sheet sub-view. */
export function SheetBack({ onClick }: { onClick: () => void }) {
  const t = useTranslations("mobileMisc");
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-5 py-2 text-[13px] font-semibold text-accent"
    >
      ‹ {t("common.back")}
    </button>
  );
}
