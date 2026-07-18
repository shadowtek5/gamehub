// Installing a release bundle: safely unpack a .zip, validate it, stage it as
// the version to boot next, and (separately) request a restart so the
// entrypoint picks it up. Also rollback + pruning of old releases.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import yauzl from "yauzl";
import {
  IMAGE,
  appRoot,
  releaseDir,
  releasesDir,
  installedReleases,
  readMarker,
  writeMarker,
} from "./paths";
import { parseManifest, checkCompatible, imageVersion, type ReleaseManifest } from "./manifest";

const S_IFLNK = 0o120000;

/**
 * Extract a zip into destDir, one entry at a time. Guards every entry against
 * Zip-Slip: the resolved output path must stay within destDir. Directory entries
 * create folders; file entries stream to disk; SYMLINK entries (unix mode
 * S_IFLNK in the external attributes) are recreated as symlinks — required for
 * Next.js's serverExternalPackages aliases under .next/node_modules (better-
 * sqlite3, sharp), whose targets are also validated to stay within destDir.
 */
export function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    const destRoot = path.resolve(destDir);
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("Cannot open zip"));
      let done = false;
      const fail = (e: Error) => {
        if (!done) {
          done = true;
          try {
            zip.close();
          } catch {}
          reject(e);
        }
      };
      const within = (p: string) => p === destRoot || p.startsWith(destRoot + path.sep);

      zip.on("entry", (entry: yauzl.Entry) => {
        const name = entry.fileName.replace(/\\/g, "/");
        const target = path.resolve(destRoot, name);
        if (!within(target)) return fail(new Error(`Unsafe path in zip: ${entry.fileName}`));

        // directory
        if (/\/$/.test(name)) {
          fs.mkdirSync(target, { recursive: true });
          zip.readEntry();
          return;
        }

        const unixMode = (entry.externalFileAttributes ?? 0) >>> 16;
        const isSymlink = (unixMode & 0o170000) === S_IFLNK;

        fs.mkdirSync(path.dirname(target), { recursive: true });

        if (isSymlink) {
          // the entry body is the link target string
          zip.openReadStream(entry, (err2, rs) => {
            if (err2 || !rs) return fail(err2 ?? new Error("Cannot read zip entry"));
            const chunks: Buffer[] = [];
            rs.on("error", fail);
            rs.on("data", (d: Buffer) => chunks.push(d));
            rs.on("end", () => {
              try {
                const linkTarget = Buffer.concat(chunks).toString("utf8");
                // a symlink target must not escape the release dir
                const resolved = path.resolve(path.dirname(target), linkTarget);
                if (!within(resolved)) throw new Error(`Unsafe symlink target: ${name} -> ${linkTarget}`);
                fs.rmSync(target, { force: true });
                fs.symlinkSync(linkTarget, target);
              } catch (e) {
                return fail(e as Error);
              }
              zip.readEntry();
            });
          });
          return;
        }

        // regular file
        zip.openReadStream(entry, (err2, rs) => {
          if (err2 || !rs) return fail(err2 ?? new Error("Cannot read zip entry"));
          const ws = fs.createWriteStream(target);
          rs.on("error", fail);
          ws.on("error", fail);
          ws.on("close", () => zip.readEntry());
          rs.pipe(ws);
        });
      });
      zip.on("end", () => {
        if (!done) {
          done = true;
          resolve();
        }
      });
      zip.on("error", fail);
      zip.readEntry();
    });
  });
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    const rs = fs.createReadStream(file);
    rs.on("error", reject);
    rs.on("data", (d) => h.update(d));
    rs.on("end", () => resolve(h.digest("hex")));
  });
}

export interface InstalledRelease {
  version: string;
  manifest: ReleaseManifest;
}

/**
 * Unpack + validate a release zip into releases/<version>. Does NOT change which
 * version boots — call stageRelease() for that. Rejects incompatible or
 * malformed bundles before they can replace the current install.
 */
export async function installFromZip(zipPath: string): Promise<InstalledRelease> {
  fs.mkdirSync(releasesDir(), { recursive: true });
  const tmp = path.join(releasesDir(), `.tmp-${crypto.randomBytes(6).toString("hex")}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  try {
    await extractZip(zipPath, tmp);

    const manifestPath = path.join(tmp, "manifest.json");
    if (!fs.existsSync(manifestPath)) throw new Error("Bundle has no manifest.json — not a GameHub release");
    const manifest = parseManifest(fs.readFileSync(manifestPath, "utf8"));

    if (!fs.existsSync(path.join(tmp, "server.js"))) throw new Error("Bundle has no server.js");
    if (!fs.existsSync(path.join(tmp, ".next"))) throw new Error("Bundle has no .next output");

    const compat = checkCompatible(manifest);
    if (!compat.ok) throw new Error(`Incompatible release: ${compat.reason}`);

    const dest = releaseDir(manifest.version);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(tmp, dest);
    return { version: manifest.version, manifest };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Make `version` the release the entrypoint boots next. Records the currently
 * healthy version (or the image) as the crash-loop rollback target and resets
 * the trial counter. The change takes effect on the next restart.
 */
export function stageRelease(version: string): void {
  if (version !== IMAGE && !installedReleases().includes(version)) {
    throw new Error(`Release ${version} is not installed`);
  }
  const rollbackTo = readMarker("healthy") || readMarker("current") || IMAGE;
  fs.mkdirSync(appRoot(), { recursive: true });
  writeMarker("rollback", rollbackTo === version ? IMAGE : rollbackTo);
  writeMarker("current", version);
  writeMarker("trials", "0");
}

/** Point `current` back at a specific version (or the image) and restart-ready. */
export function rollbackTo(version: string): void {
  if (version !== IMAGE && !installedReleases().includes(version)) {
    throw new Error(`Release ${version} is not installed`);
  }
  writeMarker("current", version);
  writeMarker("trials", "0");
}

/**
 * Delete old release folders, keeping: the current & rollback & healthy targets
 * plus the newest `keep` by version. Never touches the running/booted release.
 */
export function pruneReleases(keep = 3): string[] {
  const protectedSet = new Set(
    [readMarker("current"), readMarker("rollback"), readMarker("healthy")].filter(
      (v): v is string => Boolean(v) && v !== IMAGE
    )
  );
  const all = installedReleases().sort(compareVersions);
  const keepNewest = new Set(all.slice(-keep));
  const removed: string[] = [];
  for (const v of all) {
    if (protectedSet.has(v) || keepNewest.has(v)) continue;
    fs.rmSync(releaseDir(v), { recursive: true, force: true });
    removed.push(v);
  }
  return removed;
}

/** Numeric-ish semver compare (a<b => -1). Ignores pre-release tags. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-+]/).map((n) => parseInt(n, 10));
  const pb = b.split(/[.\-+]/).map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (Number.isNaN(x) || Number.isNaN(y)) break;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Flush the HTTP response, then exit so the container restart policy relaunches
 * the process and the entrypoint boots the staged release. Requires the Docker
 * runtime (restart: unless-stopped).
 */
export function requestRestart(delayMs = 400): void {
  setTimeout(() => process.exit(0), delayMs);
}

/** True once the image floor is known (always) — the fallback can't be pruned. */
export function fallbackVersion(): string {
  return imageVersion();
}
