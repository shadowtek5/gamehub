// GitHub Releases update feed: find the newest published release, locate its
// gamehub-<version>.zip asset and the matching .sha256, and download+verify.

import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { getSetting } from "../db";
import { sha256File } from "./installer";

export interface FeedRelease {
  version: string;
  tag: string;
  zipUrl: string;
  zipName: string;
  sha256Url: string | null;
  notesUrl: string;
  body: string;
  publishedAt: string;
  prerelease: boolean;
}

const DEFAULT_REPO = "shadowtek5/gamehub";

export function getRepo(): string {
  const r = getSetting("update.repo");
  return r && /^[\w.-]+\/[\w.-]+$/.test(r) ? r : DEFAULT_REPO;
}

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "GameHub-Updater",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = getSetting("update.githubToken") || process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

interface GhAsset {
  name: string;
  browser_download_url: string;
}
interface GhRelease {
  tag_name: string;
  html_url: string;
  body: string | null;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
  assets: GhAsset[];
}

function toFeedRelease(r: GhRelease): FeedRelease | null {
  const version = r.tag_name.replace(/^v/i, "");
  if (!/^\d+\.\d+/.test(version)) return null;
  const zip = r.assets.find((a) => a.name === `gamehub-${version}.zip`);
  if (!zip) return null;
  const sha = r.assets.find((a) => a.name === `${zip.name}.sha256`);
  return {
    version,
    tag: r.tag_name,
    zipUrl: zip.browser_download_url,
    zipName: zip.name,
    sha256Url: sha?.browser_download_url ?? null,
    notesUrl: r.html_url,
    body: r.body ?? "",
    publishedAt: r.published_at,
    prerelease: r.prerelease,
  };
}

/**
 * Newest usable release for the configured channel. channel "beta" considers
 * prereleases; "stable" (default) only stable releases.
 */
export async function fetchLatestRelease(): Promise<FeedRelease | null> {
  const repo = getRepo();
  const channel = getSetting("update.channel") || "stable";
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=20`, {
    headers: ghHeaders(),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${res.statusText}${res.status === 403 ? " (rate limited?)" : ""}`);
  }
  const list = (await res.json()) as GhRelease[];
  for (const r of list) {
    if (r.draft) continue;
    if (r.prerelease && channel !== "beta") continue;
    const fr = toFeedRelease(r);
    if (fr) return fr; // list is newest-first
  }
  return null;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "GameHub-Updater" } });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.text();
}

/** Parse the leading hex digest from a `<hash>  <file>` .sha256 file body. */
function parseSha256(body: string): string | null {
  const m = body.trim().match(/^([a-fA-F0-9]{64})\b/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Download a release zip to destPath and verify its SHA-256 against the
 * release's .sha256 asset. Rejects (and deletes the file) on mismatch or if no
 * checksum is available — updates are never applied unverified.
 */
export async function downloadAndVerify(rel: FeedRelease, destPath: string): Promise<{ sha256: string }> {
  if (!rel.sha256Url) {
    throw new Error(`Release ${rel.version} has no .sha256 checksum asset — refusing to install unverified`);
  }
  const expected = parseSha256(await fetchText(rel.sha256Url));
  if (!expected) throw new Error("Could not parse expected SHA-256");

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.rmSync(destPath, { force: true });
  const res = await fetch(rel.zipUrl, { headers: { "User-Agent": "GameHub-Updater" } });
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as import("stream/web").ReadableStream), fs.createWriteStream(destPath));

  const actual = await sha256File(destPath);
  if (actual !== expected) {
    fs.rmSync(destPath, { force: true });
    throw new Error(`Checksum mismatch: expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…`);
  }
  return { sha256: actual };
}
