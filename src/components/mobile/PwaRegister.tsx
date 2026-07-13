"use client";

// Registers the (no-op, no-cache) service worker so the mobile app is
// installable. Renders nothing. Only mounted in the /mobile shell.

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const t = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }, 0);
    return () => clearTimeout(t);
  }, []);
  return null;
}
