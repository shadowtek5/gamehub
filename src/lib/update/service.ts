// High-level update orchestration used by the API routes and the background
// auto-update poller: settings, cached "is there an update?" checks, and the
// download → verify → install → stage pipeline.

import fs from "fs";
import path from "path";
import { getSetting, setSetting } from "../db";
import { appRoot, installedReleases, readMarker, IMAGE } from "./paths";
import {
  runningVersion,
  imageVersion,
  bootedRelease,
  selfUpdateSupported,
} from "./manifest";
import { compareVersions, installFromZip, stageRelease, pruneReleases } from "./installer";
import { fetchLatestRelease, downloadAndVerify, getRepo, type FeedRelease } from "./feed";

export interface UpdateSettings {
  autoCheck: boolean;
  autoApply: boolean;
  channel: string;
  repo: string;
  intervalHours: number;
}

export function getUpdateSettings(): UpdateSettings {
  return {
    autoCheck: getSetting("update.autoCheck") !== "0",
    autoApply: getSetting("update.autoApply") === "1",
    channel: getSetting("update.channel") || "stable",
    repo: getRepo(),
    intervalHours: Math.max(1, parseInt(getSetting("update.intervalHours") || "6", 10) || 6),
  };
}

export function setUpdateSettings(p: Partial<UpdateSettings>): void {
  if (p.autoCheck !== undefined) setSetting("update.autoCheck", p.autoCheck ? "1" : "0");
  if (p.autoApply !== undefined) setSetting("update.autoApply", p.autoApply ? "1" : "0");
  if (p.channel !== undefined) setSetting("update.channel", p.channel === "beta" ? "beta" : "stable");
  if (p.repo !== undefined && /^[\w.-]+\/[\w.-]+$/.test(p.repo)) setSetting("update.repo", p.repo);
  if (p.intervalHours !== undefined) setSetting("update.intervalHours", String(Math.max(1, p.intervalHours)));
}

export interface CachedAvailable {
  version: string;
  tag: string;
  notesUrl: string;
  body: string;
  publishedAt: string;
  prerelease: boolean;
  checkedAt: string;
}

function cacheAvailable(rel: FeedRelease | null): CachedAvailable | null {
  const checkedAt = new Date().toISOString();
  setSetting("update.lastCheck", checkedAt);
  if (!rel) {
    setSetting("update.available", "");
    return null;
  }
  const cached: CachedAvailable = {
    version: rel.version,
    tag: rel.tag,
    notesUrl: rel.notesUrl,
    body: rel.body.slice(0, 4000),
    publishedAt: rel.publishedAt,
    prerelease: rel.prerelease,
    checkedAt,
  };
  setSetting("update.available", JSON.stringify(cached));
  return cached;
}

export function getCachedAvailable(): CachedAvailable | null {
  const raw = getSetting("update.available");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedAvailable;
  } catch {
    return null;
  }
}

/** True when `latest` is newer than the running version. */
export function isNewer(latest: string): boolean {
  return compareVersions(runningVersion(), latest) < 0;
}

export interface CheckResult {
  updateAvailable: boolean;
  latest: CachedAvailable | null;
  current: string;
  error?: string;
}

/**
 * Check the feed for a newer release. Honors the cache unless `force`; always
 * updates the cache on a successful live check.
 */
export async function checkForUpdate(force = false): Promise<CheckResult> {
  const current = runningVersion();
  if (!force) {
    const last = getSetting("update.lastCheck");
    const { intervalHours } = getUpdateSettings();
    if (last && Date.now() - Date.parse(last) < intervalHours * 3600_000) {
      const cached = getCachedAvailable();
      return { current, latest: cached, updateAvailable: Boolean(cached && isNewer(cached.version)) };
    }
  }
  try {
    const rel = await fetchLatestRelease();
    const cached = cacheAvailable(rel);
    return { current, latest: cached, updateAvailable: Boolean(cached && isNewer(cached.version)) };
  } catch (e) {
    return { current, latest: getCachedAvailable(), updateAvailable: false, error: (e as Error).message };
  }
}

export interface UpdateStatus {
  supported: boolean;
  running: string; // version of the executing code
  booted: string; // "image" or a version (what the entrypoint launched)
  image: string; // baked-in fallback floor
  staged: string | null; // `current` marker (boots next), if different
  installed: string[]; // installed release versions
  rollback: string | null;
  settings: UpdateSettings;
  lastCheck: string | null;
  available: CachedAvailable | null;
  updateAvailable: boolean;
}

export function getStatus(): UpdateStatus {
  const running = runningVersion();
  const current = readMarker("current");
  const available = getCachedAvailable();
  return {
    supported: selfUpdateSupported(),
    running,
    booted: bootedRelease(),
    image: imageVersion(),
    staged: current && current !== IMAGE && current !== running ? current : null,
    installed: installedReleases().sort(compareVersions),
    rollback: readMarker("rollback"),
    settings: getUpdateSettings(),
    lastCheck: getSetting("update.lastCheck"),
    available,
    updateAvailable: Boolean(available && isNewer(available.version)),
  };
}

function downloadsDir(): string {
  return path.join(appRoot(), "downloads");
}

/**
 * Full auto-update path for a feed release: download + SHA-256 verify → unpack
 * & validate → stage as next boot → prune old → clean temp. Returns the staged
 * version. Does NOT restart (the caller decides when to apply).
 */
export async function downloadInstallStage(rel: FeedRelease): Promise<string> {
  fs.mkdirSync(downloadsDir(), { recursive: true });
  const zipPath = path.join(downloadsDir(), rel.zipName);
  try {
    await downloadAndVerify(rel, zipPath);
    const { version } = await installFromZip(zipPath);
    stageRelease(version);
    pruneReleases();
    return version;
  } finally {
    fs.rmSync(zipPath, { force: true });
  }
}

/** Install an admin-uploaded zip already saved at tmpZipPath, and stage it. */
export async function installUploadedZip(tmpZipPath: string): Promise<string> {
  const { version } = await installFromZip(tmpZipPath);
  stageRelease(version);
  pruneReleases();
  return version;
}

/** Resolve + download + stage the latest feed release. Returns null if none. */
export async function installLatestFromFeed(): Promise<string | null> {
  const rel = await fetchLatestRelease();
  if (!rel || !isNewer(rel.version)) return null;
  return downloadInstallStage(rel);
}
