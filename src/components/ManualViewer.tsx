"use client";

// In-app PDF manual viewer: a full-screen overlay with the browser's native
// PDF renderer in an iframe — no new tab, B/Escape closes like any overlay.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

export default function ManualViewer({
  url,
  title,
  trigger = true,
}: {
  url: string;
  title: string;
  /** Render the "📖 Manual" button. Set false when mounted only to listen for
   *  the gh-open-manual event (so the viewer works from any tab / the menu). */
  trigger?: boolean;
}) {
  const t = useTranslations("gameToolsMisc");
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const close = () => {
      playSound("modalClose");
      setOpen(false);
    };
    const onB = (e: Event) => {
      if (openRef.current) {
        e.preventDefault();
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openRef.current) {
        e.stopImmediatePropagation();
        close();
      }
    };
    // opened from the game options menu's "Read Manual" item
    const onOpen = () => {
      playSound("modalOpen");
      setOpen(true);
    };
    window.addEventListener("gh-b", onB);
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("gh-open-manual", onOpen);
    return () => {
      window.removeEventListener("gh-b", onB);
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("gh-open-manual", onOpen);
    };
  }, []);

  return (
    <>
      {trigger && (
        <button
          onClick={() => {
            playSound("modalOpen");
            setOpen(true);
          }}
          className="cursor-pointer rounded bg-[#2a3540] px-6 py-3 text-sm font-semibold text-body transition-colors hover:bg-[#37434f] hover:text-bright"
        >
          📖 {t("shared.manual")}
        </button>
      )}

      {open && (
        <div
          className="ModalOverlayBackground gamepadui_GamepadDialogOverlay_gh fixed inset-0 z-[1600] flex items-center justify-center bg-black/80 p-3 backdrop-blur-[8px] sm:p-6"
          data-overlay="open"
          onClick={() => {
            playSound("modalClose");
            setOpen(false);
          }}
        >
          <div className="ModalOverlayContent" style={{ display: "contents" }}>
            <div
              className="gamepaddialog_ModalPosition_gh h-[94vh] w-[min(1100px,96vw)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="gamepaddialog_GamepadDialogContent_gh GenericConfirmDialog DialogContent flex h-full w-full flex-col overflow-hidden bg-[#171d25] shadow-2xl">
                <div className="DialogHeader flex shrink-0 items-center justify-between gap-4 border-b-2 border-black/40 bg-[#1c2129] px-5 py-2.5">
                  <span className="min-w-0 truncate text-[15px] font-bold text-bright">
                    {title} — {t("shared.manual")}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <a href={url} download className="btn-gray DialogButton Focusable px-3 py-1.5 text-xs">
                      {t("manualViewer.download")}
                    </a>
                    <button
                      onClick={() => {
                        playSound("modalClose");
                        setOpen(false);
                      }}
                      className="btn-gray DialogButton Focusable cursor-pointer px-3 py-1.5 text-xs"
                    >
                      ✕ {t("shared.close")}
                    </button>
                  </span>
                </div>
                <iframe
                  src={url}
                  title={t("manualViewer.iframeTitle", { title })}
                  className="min-h-0 w-full flex-1 border-0 bg-[#2b2b2b]"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
