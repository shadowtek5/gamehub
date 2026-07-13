"use client";

// Flash games in the browser via Ruffle (loaded from unpkg). Exit pops the
// /play history entry.

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

declare global {
  interface Window {
    RufflePlayer?: {
      newest(): {
        createPlayer(): HTMLElement & {
          load(opts: { url: string; autoplay?: string; base?: string }): void;
        };
      };
    };
  }
}

const RUFFLE_JS = "https://unpkg.com/@ruffle-rs/ruffle";

export default function RufflePlayer({
  romId,
  title,
}: {
  romId: number;
  title: string;
}) {
  const t = useTranslations("gameToolsMisc");
  const mount = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    function init() {
      if (!window.RufflePlayer || !mount.current) return;
      const player = window.RufflePlayer.newest().createPlayer();
      player.style.width = "100%";
      player.style.height = "100%";
      mount.current.appendChild(player);
      player.load({ url: `/api/roms/${romId}/file`, autoplay: "on" });
    }

    if (window.RufflePlayer) {
      init();
    } else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${RUFFLE_JS}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = RUFFLE_JS;
        document.head.appendChild(script);
      }
      script.addEventListener("load", init);
    }
  }, [romId]);

  function exit() {
    const target = `/game/${romId}`;
    let handled = false;
    window.addEventListener(
      "popstate",
      () => {
        handled = true;
        window.location.replace(target);
      },
      { once: true }
    );
    window.history.back();
    setTimeout(() => {
      if (!handled) window.location.replace(target);
    }, 400);
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      <div className="flex h-12 shrink-0 items-center gap-4 bg-[#171a21] px-4">
        <button onClick={exit} className="btn-gray cursor-pointer px-3 py-1.5 text-xs">
          ← {t("ruffle.exit")}
        </button>
        <div className="min-w-0 truncate text-sm font-semibold text-bright">
          {title}
          <span className="ml-2 text-xs font-normal text-dim">Flash · Ruffle</span>
        </div>
      </div>
      <div ref={mount} className="relative flex-1" />
    </div>
  );
}
