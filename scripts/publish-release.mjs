// Publish a GameHub self-update release to GitHub Releases.
//
// Prereqs: build the bundle first so dist/ holds gamehub-<version>.zip and
// gamehub-<version>.zip.sha256 (see Dockerfile.release):
//   docker build -f Dockerfile.release --target export --output type=local,dest=./dist .
//
// Auth: pass a token as GH_TOKEN. We don't store one — reuse the token git
// already has in the OS credential store (never printed):
//   TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill 2>/dev/null | sed -n 's/^password=//p')
//   GH_TOKEN="$TOKEN" node scripts/publish-release.mjs
//
// Version + tag come from package.json (tag = v<version>). Release notes come
// from --notes <file>, else dist/release-notes-<version>.md, else a minimal
// default. Idempotent: if the release/tag already exists it is reused and the
// same-named assets are replaced, so re-running fixes a bad upload without
// recreating the release. Owner/repo are parsed from the `origin` remote.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = process.env.GH_TOKEN;
if (!token) throw new Error("GH_TOKEN not set (extract it from `git credential fill` — see header)");

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const version = pkg.version;
const TAG = `v${version}`;
const DIST = path.join(ROOT, "dist");
const zip = `gamehub-${version}.zip`;
const sha = `${zip}.sha256`;

for (const f of [zip, sha]) {
  if (!fs.existsSync(path.join(DIST, f))) throw new Error(`Missing dist/${f} — build the release first.`);
}

// origin → owner/repo (supports https and ssh remotes)
const remote = execSync("git remote get-url origin", { cwd: ROOT }).toString().trim();
const m = remote.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/);
if (!m) throw new Error(`Cannot parse owner/repo from origin: ${remote}`);
const [OWNER, REPO] = [m[1], m[2]];

const notesArgIdx = process.argv.indexOf("--notes");
const notesFile =
  notesArgIdx !== -1 ? process.argv[notesArgIdx + 1] : path.join(DIST, `release-notes-${version}.md`);
const body = fs.existsSync(notesFile)
  ? fs.readFileSync(notesFile, "utf8")
  : `GameHub ${TAG}\n\nSee the in-app What's New for details.`;

const H = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "GameHub-Release",
  "X-GitHub-Api-Version": "2022-11-28",
};
const base = `https://api.github.com/repos/${OWNER}/${REPO}`;

console.log(`Publishing ${OWNER}/${REPO} ${TAG} (${zip})…`);

// 1. Get existing release for the tag, or create it (creating also tags main).
let rel;
const existing = await fetch(`${base}/releases/tags/${TAG}`, { headers: H });
if (existing.ok) {
  rel = await existing.json();
  console.log(`Release ${TAG} already exists (id ${rel.id}) — reusing, replacing assets.`);
  // refresh notes/name to match this run
  await fetch(`${base}/releases/${rel.id}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `GameHub ${TAG}`, body, draft: false, prerelease: false, make_latest: "true" }),
  });
} else if (existing.status === 404) {
  const res = await fetch(`${base}/releases`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: TAG,
      target_commitish: "main",
      name: `GameHub ${TAG}`,
      body,
      draft: false,
      prerelease: false,
      make_latest: "true",
    }),
  });
  if (!res.ok) throw new Error(`Create release failed: ${res.status} ${(await res.text()).slice(0, 400)}`);
  rel = await res.json();
  console.log(`Created release ${rel.tag_name} (id ${rel.id}) — tagged main.`);
} else {
  throw new Error(`Lookup release failed: ${existing.status} ${(await existing.text()).slice(0, 300)}`);
}

// 2. Replace same-named assets, then upload fresh.
const uploads = [
  [zip, "application/zip"],
  [sha, "text/plain"],
];
for (const a of rel.assets ?? []) {
  if (uploads.some(([n]) => n === a.name)) {
    const d = await fetch(`${base}/releases/assets/${a.id}`, { method: "DELETE", headers: H });
    console.log(`  deleted stale ${a.name}: ${d.status}`);
  }
}
const uploadBase = rel.upload_url.replace(/\{.*\}$/, "");
for (const [name, ctype] of uploads) {
  const data = fs.readFileSync(path.join(DIST, name));
  const r = await fetch(`${uploadBase}?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { ...H, "Content-Type": ctype, "Content-Length": String(data.length) },
    body: data,
  });
  if (!r.ok) throw new Error(`Upload ${name} failed: ${r.status} ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  console.log(`  uploaded ${j.name} (${j.size} bytes)`);
}

console.log(`\n✔ Release live: ${rel.html_url}`);
