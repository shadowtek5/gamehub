"use client";

// BPM legend footer — fresh build from the live capture:
// 42px bar, rgba(0,0,0,.5) + 100px backdrop blur, 1.7vw side padding;
// inner 35px row (3px vertical padding); chips: 5px/8px padding, radius 6,
// 25px glyph + 12px/700 uppercase 0.5px-tracked label with 8px gap;
// MENU chip left, yellow message area, actions right.

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { goBackSmart } from "@/lib/navBack";
import { useChromeOverlayOpen } from "@/lib/chromeOverlay";
import { useControllerFamily } from "@/lib/useControllerFamily";
import { FaceGlyph, OptionsGlyph } from "@/components/ControllerGlyph";

function Chip({
  glyph,
  label,
  onClick,
  title,
  extra,
}: {
  glyph: React.ReactNode;
  label: string;
  onClick?: () => void;
  title?: string;
  /** Trailing value shown after the label (e.g. FILTER's "Advanced" pill) */
  extra?: React.ReactNode;
}) {
  const inner = (
    <>
      <span className="flex h-[25px] items-center">{glyph}</span>
      <span className="actionbuttonlegenditem_ActionButtonLabel_gh ml-2 flex items-center text-[12px] font-bold uppercase leading-[22px] tracking-[0.5px] text-white">
        {label}
        {extra}
      </span>
    </>
  );
  const cls =
    "actionbuttonlegenditem_ActionButtonLegend_gh flex items-center rounded-[6px] px-2 py-[5px] transition-colors hover:bg-white/10" +
    (onClick ? " cursor-pointer" : "");
  return onClick ? (
    <button onClick={onClick} className={cls} title={title} data-nav-skip>
      {inner}
    </button>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

export default function LegendFooter() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("legend");
  // Paired controller brand → themed button prompts (Steam-style).
  const family = useControllerFamily();
  // Near-opaque while the Main Menu / Quick Access panel is open (matches header).
  const dimmed = useChromeOverlayOpen();
  const [filterCount, setFilterCount] = useState(0);
  useEffect(() => {
    const on = (e: Event) => setFilterCount((e as CustomEvent<number>).detail ?? 0);
    window.addEventListener("gh-library-filter-active", on);
    return () => window.removeEventListener("gh-library-filter-active", on);
  }, []);

  // Footer chips are contextual to what's focused/hovered: Select only appears
  // on an interactable element, and Options only on things that HAVE options
  // (a game card → game menu, a system card → cog menu).
  const [ctx, setCtx] = useState<{
    interactable: boolean;
    gameId: string | null;
    systemSlug: string | null;
  }>({ interactable: false, gameId: null, systemSlug: null });
  useEffect(() => {
    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]';
    let focusEl: Element | null = null;
    let hoverEl: Element | null = null;
    const compute = () => {
      const el = focusEl ?? hoverEl; // keyboard/gamepad focus wins over hover
      if (!el || el.closest('[data-nav="chrome"]')) {
        setCtx((p) =>
          p.interactable || p.gameId || p.systemSlug
            ? { interactable: false, gameId: null, systemSlug: null }
            : p
        );
        return;
      }
      const focusable = el.closest(FOCUSABLE);
      const interactable = !!focusable && !focusable.closest('[data-nav="chrome"]');
      const gameId = el.closest("[data-rom-id]")?.getAttribute("data-rom-id") ?? null;
      const systemSlug = el.closest("[data-system-slug]")?.getAttribute("data-system-slug") ?? null;
      setCtx((p) =>
        p.interactable === interactable && p.gameId === gameId && p.systemSlug === systemSlug
          ? p
          : { interactable, gameId, systemSlug }
      );
    };
    const onFocusIn = (e: FocusEvent) => {
      focusEl = e.target instanceof Element ? e.target : null;
      compute();
    };
    const onFocusOut = (e: FocusEvent) => {
      focusEl = e.relatedTarget instanceof Element ? e.relatedTarget : null;
      compute();
    };
    const onOver = (e: Event) => {
      hoverEl = e.target instanceof Element ? e.target : null;
      compute();
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerover", onOver);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerover", onOver);
    };
  }, []);

  if (pathname.startsWith("/play") || pathname.startsWith("/login")) return null;

  const isGamePage = pathname.startsWith("/game/");
  const isSystemsBrowse = pathname === "/systems";
  const isLibrary = pathname === "/library";

  // What the Options chip targets right now (null = no Options chip):
  //  • a focused/hovered game card → that game's options menu (anywhere but the
  //    game page, which has its own gear)
  //  • a system card on the systems grid → the system cog menu
  //  • otherwise, on non-card pages, the global Quick Access panel
  const options: { kind: "game"; id: string } | { kind: "system"; slug: string } | { kind: "quick" } | null =
    ctx.gameId && !isGamePage
      ? { kind: "game", id: ctx.gameId }
      : ctx.systemSlug && isSystemsBrowse
        ? { kind: "system", slug: ctx.systemSlug }
        : !isGamePage && !isLibrary && !isSystemsBrowse
          ? { kind: "quick" }
          : null;
  const fireOptions = (o: typeof options) => {
    if (!o) return;
    if (o.kind === "game")
      window.dispatchEvent(new CustomEvent("gh-game-options", { detail: o.id }));
    else if (o.kind === "system")
      window.dispatchEvent(new CustomEvent("gh-system-options", { detail: o.slug }));
    else window.dispatchEvent(new Event("gh-quickaccess"));
  };

  return (
    <div
      data-nav="chrome"
      className="footer_BasicFooter_gh fixed inset-x-0 bottom-0 z-[70] flex h-[42px] items-center px-[1.7vw] backdrop-blur-[100px] transition-[background-color] duration-200"
      style={{
        backgroundColor: dimmed
          ? "color-mix(in oklab, var(--color-black) 96%, transparent)"
          : "color-mix(in oklab, var(--color-black) 94%, transparent)",
      }}
    >
      <div className="footer_FooterLegend_gh flex h-[35px] w-full items-center py-[3px]">
        <Chip
          glyph={
            <span className="flex h-[22px] items-center rounded-full border-2 border-white px-2 text-[10px] font-black tracking-wide text-white">
              GH
            </span>
          }
          label={t("menu")}
          onClick={() => window.dispatchEvent(new Event("gh-mainmenu"))}
          title={t("mainMenuTitle")}
        />
        <div className="ml-6 min-w-0 flex-1 truncate text-[12px] leading-4 text-[#ffc82c]" />
        {(pathname === "/library" || pathname.startsWith("/systems/")) && (
          <>
            <Chip
              glyph={<FaceGlyph family={family} pos="west" />}
              label={filterCount > 0 ? t("filterActive") : t("filter")}
              extra={
                filterCount > 0 ? (
                  <span className="appgrid_CompatFooterDescription_gh">
                    <span className="appgrid_CompatFooterIcons_gh appgrid_Advanced_gh">{t("advanced")}</span>
                  </span>
                ) : undefined
              }
              onClick={() => window.dispatchEvent(new Event("gh-library-filter"))}
              title={filterCount > 0 ? t("filterLibraryActive", { count: filterCount }) : t("filterLibrary")}
            />
            <Chip
              glyph={<FaceGlyph family={family} pos="north" />}
              label={t("sortBy")}
              onClick={() => window.dispatchEvent(new Event("gh-library-sort"))}
              title={t("sortLibrary")}
            />
          </>
        )}
        {options && (
          <Chip
            glyph={<OptionsGlyph family={family} />}
            label={t("options")}
            onClick={() => fireOptions(options)}
            title={
              options.kind === "game"
                ? t("gameOptions")
                : options.kind === "system"
                  ? t("systemOptions")
                  : t("quickAccessSelect")
            }
          />
        )}
        {/* Select (Ⓐ) activates the focused element — only meaningful when one is */}
        {ctx.interactable && <Chip glyph={<FaceGlyph family={family} pos="south" />} label={t("select")} />}
        <Chip glyph={<FaceGlyph family={family} pos="east" />} label={t("back")} onClick={() => goBackSmart(router.push)} title={t("back")} />
      </div>
    </div>
  );
}
