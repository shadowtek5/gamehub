"use client";

// Floating "scroll to top" affordance for long, window-scrolled pages (library,
// systems, collections). Fades in past a scroll threshold; a click returns to the
// top — smoothly, or instantly under Reduce Motion. Pointer-only (data-nav-skip
// keeps it out of gamepad navigation). Position is overridable so the mobile app
// can lift it above its bottom nav.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export default function ScrollToTop({ className = "bottom-14 right-5" }: { className?: string }) {
  const t = useTranslations("common");
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function toTop() {
    const reduce =
      document.documentElement.dataset.reduceMotion === "on" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      data-nav-skip
      onClick={toTop}
      aria-label={t("scrollToTop")}
      title={t("scrollToTop")}
      className={`fixed z-40 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white shadow-lg ring-1 ring-white/15 backdrop-blur-sm transition-[opacity,background-color] hover:bg-black/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${className} ${
        show ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 15l6-6 6 6" />
      </svg>
    </button>
  );
}
