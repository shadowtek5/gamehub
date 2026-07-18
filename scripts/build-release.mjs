#!/usr/bin/env node
// Package a GameHub self-update release.
//
//   1. `BUILD_STANDALONE=1 npm run build`        (produces .next/standalone)
//   2. `node scripts/build-release.mjs`          (this script)
//
// Emits into dist/:
//   gamehub-<version>.zip          the release bundle (uploaded / auto-fetched)
//   gamehub-<version>.zip.sha256   its SHA-256 (integrity check)
//   latest.json                    feed manifest (self-hosted auto-update option)
//
// IMPORTANT: run this inside the SAME runtime the container uses
// (node:22-bookworm-slim, linux-x64) so the native binaries bundled in the
// standalone node_modules (better-sqlite3, sharp) match the target. Building on
// Windows/macOS produces a bundle that will NOT boot in the Linux container —
// the script warns when the host platform isn't linux-x64.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { zipDir } from "./lib/zip.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const version = pkg.version;
if (!version) throw new Error("package.json has no version");

const TARGET_PLATFORM = process.env.RELEASE_PLATFORM || "linux-x64";
const hostPlatform = `${process.platform}-${process.arch}`.replace("win32", "windows");
if (hostPlatform !== TARGET_PLATFORM && !process.env.RELEASE_ALLOW_CROSS) {
  console.warn(
    `\n⚠  Building on ${hostPlatform} but targeting ${TARGET_PLATFORM}.\n` +
      `   The bundled native modules (better-sqlite3, sharp) are ${hostPlatform}\n` +
      `   binaries and will NOT run in the Linux container. Build inside\n` +
      `   node:22-bookworm-slim for a real release, or set RELEASE_ALLOW_CROSS=1\n` +
      `   to package anyway (e.g. for local testing).\n`
  );
}

const standalone = path.join(ROOT, ".next", "standalone");
const staticDir = path.join(ROOT, ".next", "static");
const publicDir = path.join(ROOT, "public");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  throw new Error(
    "No .next/standalone/server.js — run `BUILD_STANDALONE=1 npm run build` first."
  );
}

const dist = path.join(ROOT, "dist");
const stage = path.join(dist, `stage-${version}`);
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

console.log(`Assembling gamehub ${version} (${TARGET_PLATFORM})…`);
// standalone carries server.js, package.json, node_modules and a pruned .next.
// verbatimSymlinks keeps the RELATIVE symlink targets Next emits under
// .next/node_modules/<pkg>-<hash> -> ../../node_modules/<pkg> for each
// serverExternalPackages native module. Without it, cpSync rewrites them to
// absolute build-time paths that don't exist in the installed release, so
// `require("<pkg>-<hash>")` fails at runtime (better-sqlite3, sharp).
fs.cpSync(standalone, stage, { recursive: true, verbatimSymlinks: true });
// standalone does NOT include static assets or public/ — add them
fs.cpSync(staticDir, path.join(stage, ".next", "static"), { recursive: true });
if (fs.existsSync(publicDir)) fs.cpSync(publicDir, path.join(stage, "public"), { recursive: true });

const manifest = {
  schema: 1,
  name: "gamehub",
  version,
  platform: TARGET_PLATFORM,
  node: process.versions.node.split(".")[0],
  builtAt: new Date().toISOString(),
  commit: process.env.GIT_SHA || process.env.GITHUB_SHA || null,
};
fs.writeFileSync(path.join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const zipName = `gamehub-${version}.zip`;
const zipPath = path.join(dist, zipName);
fs.rmSync(zipPath, { force: true });
console.log(`Zipping → dist/${zipName} …`);
const { entries, bytes } = zipDir(stage, zipPath);

const sha256 = crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
fs.writeFileSync(`${zipPath}.sha256`, `${sha256}  ${zipName}\n`);

const latest = {
  version,
  asset: zipName,
  sha256,
  platform: TARGET_PLATFORM,
  node: manifest.node,
  builtAt: manifest.builtAt,
};
fs.writeFileSync(path.join(dist, "latest.json"), JSON.stringify(latest, null, 2) + "\n");

fs.rmSync(stage, { recursive: true, force: true });

const mb = (bytes / 1024 / 1024).toFixed(1);
console.log(
  `\n✔ dist/${zipName}  (${entries} files, ${mb} MB)\n` +
    `  sha256 ${sha256}\n` +
    `  dist/${zipName}.sha256, dist/latest.json written\n\n` +
    `Publish: attach ${zipName} + ${zipName}.sha256 to a GitHub Release tagged v${version}.`
);
