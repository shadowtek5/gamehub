// Server-startup background tasks for self-update, kicked off from
// src/instrumentation.ts (Node runtime only):
//
//  1. Health confirmation — once a freshly-booted staged release has stayed up
//     for a grace period, record it as `healthy` and clear the crash-loop trial
//     counter. If it instead crashes on boot, the counter keeps climbing and
//     docker-entrypoint.sh auto-reverts after 3 tries.
//
//  2. Auto-update poller — periodically check the GitHub Releases feed; if
//     auto-apply is on, download+verify+stage the new release and restart.

import { writeMarker, readMarker, IMAGE } from "./paths";
import { bootedRelease, runningVersion, selfUpdateSupported } from "./manifest";
import { requestRestart } from "./installer";

const HEALTHY_GRACE_MS = 45_000;

let started = false;

export function startUpdateBackground(): void {
  if (started) return;
  started = true;
  if (!selfUpdateSupported()) return;

  confirmHealthyLater();
  startPoller();
}

/** After a grace period of staying up, trust the booted release. */
function confirmHealthyLater(): void {
  const booted = bootedRelease();
  if (booted === IMAGE) return; // the image is the always-trusted floor
  const t = setTimeout(() => {
    try {
      if (readMarker("current") === booted) {
        writeMarker("healthy", booted);
        writeMarker("trials", "0");
      }
    } catch {
      /* markers are best-effort */
    }
  }, HEALTHY_GRACE_MS);
  t.unref?.();
}

let polling = false;

function startPoller(): void {
  const tick = async () => {
    if (polling) return;
    polling = true;
    try {
      const { getUpdateSettings, checkForUpdate, installLatestFromFeed } = await import("./service");
      const settings = getUpdateSettings();
      if (!settings.autoCheck) return;
      const res = await checkForUpdate(false);
      if (res.updateAvailable && settings.autoApply) {
        const staged = await installLatestFromFeed();
        if (staged) {
          console.log(`gamehub: auto-update installed ${staged}, restarting to apply`);
          requestRestart(1000);
        }
      }
    } catch (e) {
      console.warn("gamehub: auto-update check failed:", (e as Error).message);
    } finally {
      polling = false;
    }
  };

  // first check shortly after boot, then hourly (checkForUpdate honors the
  // configured interval via its own cache, so hourly ticks are cheap no-ops
  // until the interval elapses)
  const first = setTimeout(tick, 60_000);
  first.unref?.();
  const iv = setInterval(tick, 3600_000);
  iv.unref?.();
}

/** Exposed for a manual "running version" read in logs. */
export function describeRuntime(): string {
  return `${runningVersion()} (booted ${bootedRelease()})`;
}
