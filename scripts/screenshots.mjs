// Capture the README screenshots from a running GameHub instance.
//
//   GH_USER=you GH_PASS=secret node scripts/screenshots.mjs
//
// Env:
//   GH_URL   base URL of the running app   (default http://localhost:3000)
//   GH_USER  admin username                (required)
//   GH_PASS  admin password                (required)
//   SCALE    device scale factor           (default 2 — retina-crisp; use 1 for smaller files)
//   GAME_ID  specific game id for game.png (default: first game in the library)
//   PLAY_ID  specific game id for play.png (default: GAME_ID)
//
// Writes PNGs into docs/screenshots/ matching the README gallery.

import { chromium } from "playwright";
import sharp from "sharp";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const BASE = (process.env.GH_URL || "http://localhost:3000").replace(/\/$/, "");
const USER = process.env.GH_USER;
const PASS = process.env.GH_PASS;
const SESSION = process.env.GH_SESSION; // raw session token — alternative to user/pass
const SCALE = Number(process.env.SCALE || 2);
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "screenshots");

if (!SESSION && (!USER || !PASS)) {
  console.error("Set GH_USER and GH_PASS (an admin login), or GH_SESSION (a raw session token). Example:");
  console.error("  GH_USER=admin GH_PASS=secret node scripts/screenshots.mjs");
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: SCALE,
  colorScheme: "dark",
});
const page = await context.newPage();

// --- authenticate: an injected session cookie, or a normal API login ---
if (SESSION) {
  await context.addCookies([
    { name: "gh_session", value: SESSION, domain: new URL(BASE).hostname, path: "/" },
  ]);
  console.log(`Using provided session cookie against ${BASE}.`);
} else {
  const login = await context.request.post(`${BASE}/api/auth/login`, {
    data: { username: USER, password: PASS },
  });
  if (!login.ok()) {
    console.error(`Login failed (HTTP ${login.status()}) — check GH_URL / GH_USER / GH_PASS.`);
    await browser.close();
    process.exit(1);
  }
  console.log(`Logged in to ${BASE} as ${USER}.`);
}

async function goto(url) {
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
}

async function clickLabel(text) {
  const re = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  await page.getByRole("button", { name: re }).first().click({ timeout: 5000 });
}

// Optional: only capture these shots, e.g. SHOTS=game,play
const ONLY = (process.env.SHOTS || "").split(",").map((s) => s.trim()).filter(Boolean);

async function shot(name, fn) {
  if (ONLY.length && !ONLY.includes(name.replace(/\.png$/, ""))) return;
  try {
    await fn();
    // Hide the Next.js dev-mode error/toast overlay if present.
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    // Capture then transcode to a repo-light WebP (resized to 1920 wide).
    const buf = await page.screenshot();
    const outName = name.replace(/\.png$/, ".webp");
    await sharp(buf).resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 85, effort: 6 }).toFile(path.join(OUT, outName));
    console.log(`✓ ${outName}`);
  } catch (e) {
    console.warn(`✗ ${name} — ${e.message}`);
  }
}

// Home — What's New
await shot("home.png", async () => {
  await goto("/");
  await clickLabel("What's New").catch(() => {});
  await wait(2500);
});

// Recommended shelves (give them time to load)
await shot("recommended.png", async () => {
  await goto("/");
  await clickLabel("Recommended").catch(() => {});
  await wait(3500);
});

// Library grid
await shot("library.png", async () => {
  await goto("/library");
  await wait(3000);
});

// Resolve a game id
let gameId = process.env.GAME_ID;
if (!gameId) {
  await goto("/library");
  await wait(1500);
  gameId = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/game/"]');
    const m = a?.getAttribute("href")?.match(/\/game\/(\d+)/);
    return m ? m[1] : null;
  });
}

if (gameId) {
  await shot("game.png", async () => {
    await goto(`/game/${gameId}`);
    await wait(3000);
  });
  await shot("play.png", async () => {
    await goto(`/play/${process.env.PLAY_ID || gameId}`);
    // Give a user gesture (some autoplay paths need one), then let the core
    // download + boot to an actual rendered frame (the title screen).
    await page.mouse.click(960, 540).catch(() => {});
    await wait(Number(process.env.PLAY_WAIT || 22000));
  });
} else {
  console.warn("No game found in the library — skipping game.png / play.png (pass GAME_ID=…).");
}

// Set Integrity (Settings → Maintenance)
await shot("set-integrity.png", async () => {
  await goto("/settings");
  await clickLabel("Maintenance").catch(() => {});
  await wait(1200);
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("*")].find((e) => e.textContent?.trim() === "Set Integrity");
    h?.scrollIntoView({ block: "start", behavior: "instant" });
  });
  await wait(800);
});

await browser.close();
console.log(`\nDone → ${OUT}`);
