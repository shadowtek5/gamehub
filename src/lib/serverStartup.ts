// Node-only server startup: the filesystem watcher and the daily auto-scan.
// Kept out of instrumentation.ts so the `fs` import is never traced into the
// Edge bundle (Next compiles instrumentation.ts for every runtime).

import { getSetting, setSetting } from "./db";
import { backfillLogoDark } from "./systemArt";
import { enqueueScan, scanPendingOrRunning } from "./jobQueue";
import { maybeRunScheduledBackup } from "./autoBackup";
import { startWatcher } from "./fsWatcher";

export function startup() {
  // ---- one-time: classify existing system logos as dark/light so the header
  // gives dark wordmarks a light backdrop (no re-scrape needed) ----
  if (getSetting("logo_dark_backfilled") !== "1") {
    backfillLogoDark()
      .then((n) => {
        setSetting("logo_dark_backfilled", "1");
        console.log(`[startup] logo-dark backfill classified ${n} logos`);
      })
      .catch(() => {});
  }

  // ---- filesystem watcher: rescan (debounced) when library files change ----
  // Reads the `fs_watcher` setting itself and no-ops when off. The watcher can
  // also be restarted at runtime from the automation settings route, so toggling
  // it no longer requires a server restart.
  startWatcher();

  // Every 30 min, check whether the interval-based tasks are due. Cadences are
  // configurable in the Automation settings (hours); we tick often and gate on
  // the stored "last run" timestamp + interval.
  const scanIntervalMs = () => {
    const h = Number(getSetting("scan_interval_hours"));
    return (Number.isFinite(h) && h > 0 ? h : 24) * 60 * 60 * 1000;
  };

  setInterval(
    () => {
      // Daily (configurable) library scan → unified queue.
      try {
        if (getSetting("auto_scan") !== "off") {
          const last = getSetting("last_auto_scan");
          const due = !last || Date.now() - Date.parse(last) >= scanIntervalMs() - 60_000;
          if (due && !scanPendingOrRunning()) {
            setSetting("last_auto_scan", new Date().toISOString());
            enqueueScan(null); // serializes with manual jobs; does cleanup+hashing+art itself
            console.log("[auto-scan] scan queued");
          }
        }
      } catch (e) {
        console.error("[auto-scan] failed:", e);
      }
      // Automated backup (config-driven; writes a .tar + prunes).
      void maybeRunScheduledBackup();
    },
    30 * 60 * 1000
  );
}
