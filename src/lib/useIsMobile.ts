"use client";

import { useEffect, useState } from "react";

// Single source of truth for "are we on a phone-sized / touch screen" in
// behavioural code (JS). Purely-visual adaptations should prefer Tailwind's
// `max-md:` / `md:` variants so they need no JS and can't flash. This hook is
// for logic that CSS can't express (which chrome to mount, long-press vs hover,
// whether to enable the on-screen gamepad, …).
//
// Matches Tailwind's `md` breakpoint (768px), so JS and CSS agree.

const QUERY = "(max-width: 767px)";

export function useIsMobile(): boolean {
  // Start false so SSR + first client paint match desktop (the default UI);
  // the effect corrects it before the user can interact.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}
