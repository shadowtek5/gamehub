// On-disk layout for the self-update mechanism, all under <data>/app:
//
//   <data>/app/
//     releases/<version>/        an unpacked release (server.js, .next, …)
//     current                    version string to boot next (or "image")
//     rollback                   auto-revert target if `current` crash-loops
//     trials                     boot attempts since last healthy confirmation
//     healthy                    version last confirmed healthy at runtime
//
// The marker files are plain text so docker-entrypoint.sh (POSIX sh) can read
// them with `cat`. The Node app and the (root) entrypoint both write them; the
// entrypoint re-owns them to PUID:PGID after writing so the app can rewrite.

import fs from "fs";
import path from "path";
import { dataPath } from "../dataDir";

/** Sentinel meaning "run the version baked into the Docker image". */
export const IMAGE = "image";

export function appRoot(): string {
  return dataPath("app");
}
export function releasesDir(): string {
  return path.join(appRoot(), "releases");
}
export function releaseDir(version: string): string {
  return path.join(releasesDir(), version);
}

export type Marker = "current" | "rollback" | "trials" | "healthy";

export function markerPath(name: Marker): string {
  return path.join(appRoot(), name);
}

export function readMarker(name: Marker): string | null {
  try {
    const v = fs.readFileSync(markerPath(name), "utf8").trim();
    return v.length ? v : null;
  } catch {
    return null;
  }
}

export function writeMarker(name: Marker, value: string): void {
  fs.mkdirSync(appRoot(), { recursive: true });
  fs.writeFileSync(markerPath(name), `${value}\n`, "utf8");
}

/** Installed release versions that have a valid server.js on disk. */
export function installedReleases(): string[] {
  try {
    return fs
      .readdirSync(releasesDir())
      .filter((name) => !name.startsWith(".") && fs.existsSync(path.join(releaseDir(name), "server.js")));
  } catch {
    return [];
  }
}
