"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { saveScrollFor, savedScrollFor, takeBackTo } from "@/lib/scrollMemory";

// Restores window scroll for the app's push-based hierarchical Back (see
// scrollMemory / navBack). Mounted once in each shell (Big-Picture + mobile),
// both of which scroll the document/window.
//
// We record a page's scroll offset at the moment an internal navigation starts
// — a capture-phase <a> click. That fires while the page is still fully laid
// out, so window.scrollY is the true offset. (Saving on the scroll event
// instead is unreliable: a push collapses the outgoing page's height and the
// browser clamps scrollY downward, firing scroll events with a bogus reduced
// offset that would overwrite the good value. This bites the virtualized grids
// hardest.) Gamepad / keyboard selection dispatches a real el.click() too, so
// this one hook covers mouse, touch, and controller.
//
// When Back pushes you to a page it flagged, we re-apply the saved offset,
// waiting for lazy-loaded content (the library grids re-request their prior
// item count) to grow the page tall enough to reach it, then scrolling once.
export default function ScrollRestorer() {
  const pathname = usePathname();
  const restoring = useRef(false);

  useEffect(() => {
    if (!pathname) return;

    const save = () => saveScrollFor(pathname, window.scrollY);
    const onClickCapture = (e: MouseEvent) => {
      if (restoring.current) return;
      const el = e.target instanceof Element ? e.target.closest("a[href]") : null;
      const href = el?.getAttribute("href");
      if (href && href.startsWith("/")) save(); // internal navigation imminent
    };
    document.addEventListener("click", onClickCapture, true);
    window.addEventListener("pagehide", save);

    // Restore on a flagged Back arrival.
    let cancelled = false;
    const target = takeBackTo(pathname) ? savedScrollFor(pathname) : null;
    if (target && target > 0) {
      restoring.current = true;
      const t0 = Date.now();
      const step = () => {
        if (cancelled) return;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (max >= target) {
          window.scrollTo(0, target); // tall enough — land exactly
          restoring.current = false;
          return;
        }
        if (Date.now() - t0 > 5000) {
          window.scrollTo(0, Math.max(0, max)); // gave up waiting — go as far as we can
          restoring.current = false;
          return;
        }
        requestAnimationFrame(step); // page still growing — wait a frame
      };
      requestAnimationFrame(step);
    }

    return () => {
      cancelled = true;
      restoring.current = false;
      document.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("pagehide", save);
    };
  }, [pathname]);

  return null;
}
