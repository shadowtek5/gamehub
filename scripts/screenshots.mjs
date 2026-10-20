// Capture the README screenshots from a running GameHub instance.
//
//   GH_USER=you GH_PASS=secret node scripts/screenshots.mjs
//   GH_URL=https://gamehub.example GH_TOKEN=ghk_… PRIVATE=1 node scripts/screenshots.mjs
//
// Env:
//   GH_URL     base URL of the running app   (default http://localhost:3000)
//   GH_USER    admin username                (or GH_PASS / GH_SESSION / GH_TOKEN)
//   GH_PASS    admin password
//   GH_SESSION raw session token (gh_session cookie)
//   GH_TOKEN   API token (Bearer) — sent only to GH_URL's origin, never to other sites
//   PRIVATE    1 = hide library/system game counts, replace your and your friends'
//              names with "Player", and hide avatars (for public screenshots)
//   SCALE      device scale factor           (default 2 — retina-crisp; use 1 for smaller files)
//   GAME_ID    game id for game/saves/play   (default: first game in the library)
//   PLAY_ID    game id for play              (default: GAME_ID)
//   SYSTEM     system slug for system.png    (default: nes)
//   SHOTS      only these shots, e.g. SHOTS=game,play
//
// Writes WebPs into docs/screenshots/ matching the README gallery.
// Admin-only pages (set-integrity) need an admin login, not a viewer token.

import { chromium } from "playwright";
import sharp from "sharp";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const BASE = (process.env.GH_URL || "http://localhost:3000").replace(/\/$/, "");
const ORIGIN = new URL(BASE).origin;
const USER = process.env.GH_USER;
const PASS = process.env.GH_PASS;
const SESSION = process.env.GH_SESSION; // raw session token — alternative to user/pass
const TOKEN = process.env.GH_TOKEN; // API token — alternative to user/pass
const PRIVATE = process.env.PRIVATE === "1";
const SCALE = Number(process.env.SCALE || 2);
const SYSTEM = process.env.SYSTEM || "nes";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "screenshots");

if (!SESSION && !TOKEN && (!USER || !PASS)) {
  console.error("Set GH_USER and GH_PASS (an admin login), GH_SESSION (a raw session token) or GH_TOKEN (an API token). Example:");
  console.error("  GH_USER=admin GH_PASS=secret node scripts/screenshots.mjs");
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch(process.env.CHROME_CHANNEL ? { channel: process.env.CHROME_CHANNEL } : {});

/** A browser context signed in to GameHub (cookie, login or API token). */
async function signedIn(options) {
  const context = await browser.newContext({ colorScheme: "dark", ...options });
  if (TOKEN) {
    // Add the Bearer token only to GameHub's own requests — never to CDNs or other sites.
    await context.route("**/*", (route) => {
      const req = route.request();
      if (new URL(req.url()).origin === ORIGIN) route.continue({ headers: { ...req.headers(), authorization: `Bearer ${TOKEN}` } });
      else route.continue();
    });
  } else if (SESSION) {
    await context.addCookies([{ name: "gh_session", value: SESSION, domain: new URL(BASE).hostname, path: "/" }]);
  } else {
    const login = await context.request.post(`${BASE}/api/auth/login`, { data: { username: USER, password: PASS } });
    if (!login.ok()) {
      console.error(`Login failed (HTTP ${login.status()}) — check GH_URL / GH_USER / GH_PASS.`);
      await browser.close();
      process.exit(1);
    }
  }
  return context;
}

const context = await signedIn({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: SCALE });
const page = await context.newPage();
console.log(`Signed in to ${BASE}${TOKEN ? " with an API token" : SESSION ? " with a session cookie" : ` as ${USER}`}.`);

// Names to hide when PRIVATE: the signed-in user and everyone on their friends lists.
let privateNames = [];
if (PRIVATE) {
  // page.request skips context.route, so pass the token explicitly (still only to BASE).
  const headers = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};
  const hb = await (await page.request.get(`${BASE}/api/heartbeat`, { headers })).json().catch(() => ({}));
  const fr = await (await page.request.get(`${BASE}/api/friends`, { headers })).json().catch(() => ({}));
  if (!hb.user) {
    console.error("Private mode couldn't read the signed-in username — refusing to capture unsanitized shots.");
    await browser.close();
    process.exit(1);
  }
  const people = [...(fr.friends ?? []), ...(fr.incoming ?? []), ...(fr.outgoing ?? [])];
  privateNames = [hb.user, ...people.flatMap((p) => [p.username, p.displayName, p.display_name, p.name])]
    .filter((n) => typeof n === "string" && n.trim().length >= 2)
    .map((n) => n.trim());
  privateNames = [...new Set(privateNames)].sort((a, b) => b.length - a.length);
  console.log(`Private mode: hiding counts, avatars and ${privateNames.length} name(s).`);
}

/** Runs in the page: blanks game counts, swaps personal names for "Player", hides avatars. */
function sanitize(names) {
  const COUNT_LABEL = /^(all games|favorites|collections|games|roms)$/i;
  const NUMBER = /^[\d.,]+\s*$/;
  const leaves = [...document.querySelectorAll("body *")].filter((el) => el.children.length === 0);
  for (const el of leaves) {
    const text = (el.textContent || "").trim();
    if (!text) continue;
    // "1,035 games", "Showing 150 of 1,046", "Games 1,046" in one element
    if (/^[\d.,]+\s+(games?|roms?)$/i.test(text) || /^showing [\d.,]+ of [\d.,]+$/i.test(text) || /^(all )?games\s+[\d.,]+$/i.test(text)) {
      el.style.visibility = "hidden";
      continue;
    }
    // a bare number next to (or under) a "Games"/"All games"/… label
    if (NUMBER.test(text)) {
      const near = [el.previousElementSibling, el.parentElement?.previousElementSibling, el.parentElement]
        .map((n) => (n && n !== el ? (n.firstChild?.textContent || n.textContent || "").replace(/[\d.,]/g, "").trim() : ""));
      if (near.some((t) => COUNT_LABEL.test(t))) el.style.visibility = "hidden";
    }
  }
  if (names.length) {
    const re = new RegExp(names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (re.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(re, "Player");
      re.lastIndex = 0;
    }
  }
  for (const img of document.querySelectorAll("img")) {
    const src = img.getAttribute("src") || "";
    if (/avatar/i.test(src) || /avatar/i.test(img.className || "") || (names.length && names.some((n) => (img.alt || "").includes(n)))) {
      img.style.visibility = "hidden";
    }
  }
}

async function goto(p, url) {
  await p.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
}

async function clickLabel(p, text) {
  const re = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  await p.getByRole("button", { name: re }).first().click({ timeout: 5000 });
}

// Optional: only capture these shots, e.g. SHOTS=game,play
const ONLY = (process.env.SHOTS || "").split(",").map((s) => s.trim()).filter(Boolean);

async function shot(name, fn, { on = page, width = 1920 } = {}) {
  if (ONLY.length && !ONLY.includes(name.replace(/\.png$/, ""))) return;
  try {
    await fn(on);
    // Hide the Next.js dev-mode error/toast overlay if present.
    await on.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    if (PRIVATE) await on.evaluate(sanitize, privateNames);
    // Capture then transcode to a repo-light WebP.
    const buf = await on.screenshot();
    const outName = name.replace(/\.png$/, ".webp");
    await sharp(buf).resize({ width, withoutEnlargement: true }).webp({ quality: 85, effort: 6 }).toFile(path.join(OUT, outName));
    console.log(`✓ ${outName}`);
  } catch (e) {
    console.warn(`✗ ${name} — ${e.message}`);
  }
}

// Home — What's New
await shot("home.png", async (p) => {
  await goto(p, "/");
  await clickLabel(p, "What's New").catch(() => {});
  await wait(2500);
});

// Recommended shelves (give them time to load)
await shot("recommended.png", async (p) => {
  await goto(p, "/");
  await clickLabel(p, "Recommended").catch(() => {});
  await wait(3500);
});

// Library grid
await shot("library.png", async (p) => {
  await goto(p, "/library");
  await wait(3000);
});

// A system page scrolled to its grid, with the A–Z jump strip showing.
await shot("system.png", async (p) => {
  await goto(p, `/systems/${SYSTEM}`);
  await wait(3000);
  await p.evaluate(() => {
    const card = document.querySelector("[data-rom-id]");
    if (card) window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - 140, behavior: "instant" });
  });
  await wait(1500);
  await p.mouse.move(1915, 540); // the strip fades in when the pointer nears the right edge
  await wait(600);
});

// Resolve a game id
let gameId = process.env.GAME_ID;
if (!gameId) {
  await goto(page, "/library");
  await wait(1500);
  gameId = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/game/"]');
    const m = a?.getAttribute("href")?.match(/\/game\/(\d+)/);
    return m ? m[1] : null;
  });
}

if (gameId) {
  await shot("game.png", async (p) => {
    await goto(p, `/game/${gameId}`);
    await wait(2000);
    await clickLabel(p, "Game Info").catch(() => {});
    await wait(1500);
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await wait(500);
  });
  // Saves & states (battery save, browser and synced device states)
  await shot("saves.png", async (p) => {
    await goto(p, `/game/${gameId}`);
    await wait(2000);
    await clickLabel(p, "Your Stuff").catch(() => {});
    await wait(1500);
    await p.evaluate(() => {
      const h = [...document.querySelectorAll("*")].find(
        (e) => e.children.length === 0 && /^saves (&|and) states$/i.test(e.textContent?.trim() ?? "")
      );
      h?.scrollIntoView({ block: "start", behavior: "instant" });
      window.scrollBy(0, -110);
    });
    await wait(1500);
  });
  await shot("play.png", async (p) => {
    await goto(p, `/play/${process.env.PLAY_ID || gameId}`);
    // Give a user gesture (some autoplay paths need one), then let the core
    // download + boot to an actual rendered frame (the title screen).
    await p.mouse.click(960, 540).catch(() => {});
    await wait(Number(process.env.PLAY_WAIT || 22000));
  });
} else {
  console.warn("No game found in the library — skipping game / saves / play (pass GAME_ID=…).");
}

// Set Integrity (Settings → Maintenance) — admin only
await shot("set-integrity.png", async (p) => {
  await goto(p, "/settings");
  await clickLabel(p, "Maintenance");
  await wait(1200);
  const found = await p.evaluate(() => {
    const h = [...document.querySelectorAll("*")].find((e) => e.textContent?.trim() === "Set Integrity");
    h?.scrollIntoView({ block: "start", behavior: "instant" });
    return !!h;
  });
  if (!found) throw new Error("Set Integrity isn't visible (needs an admin login)");
  await wait(800);
});

// Mobile app on a phone-sized viewport
if (!ONLY.length || ONLY.includes("mobile")) {
  const mobile = await signedIn({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const mp = await mobile.newPage();
  await shot(
    "mobile.png",
    async (p) => {
      await goto(p, "/mobile");
      await wait(3500);
    },
    { on: mp, width: 860 }
  );
  await mobile.close();
}

await browser.close();
console.log(`\nDone → ${OUT}`);
