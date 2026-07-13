// Robust monitor for the EmuMovies NES sync. Read-only; polls API + em-art.db
// until the job finishes, then verifies applied art. Lives at repo root (outside
// src/) so it doesn't trigger a dev-server recompile.
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const ROOT = process.cwd();
const token = fs.readFileSync(
  "C:/Users/jason/AppData/Local/Temp/claude/c--Users-jason-source-repos-GameHub/6e76a251-2cb6-49d0-926e-05b21328de20/scratchpad/ghtok",
  "utf8"
).trim();

function artByKey() {
  try {
    const d = new Database(path.join(ROOT, "data", "em-art.db"), { readonly: true });
    const rows = d.prepare("SELECT media_key k, COUNT(*) c FROM art WHERE slug='nes' GROUP BY media_key").all();
    d.close();
    return rows.map((r) => `${r.c} ${r.k}`).join(", ") || "0";
  } catch { return "?"; }
}
async function status() {
  try {
    const res = await fetch("http://localhost:3000/api/providers/emumovies/art", {
      headers: { Cookie: `gh_session=${token}` },
      signal: AbortSignal.timeout(12000),
    });
    return (await res.json()).job;
  } catch { return null; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let last = "";
let done = null;
for (let i = 0; i < 130; i++) {
  const j = await status();
  if (j) {
    const line = `phase=${j.phase} key=${j.currentKey} dl=${(j.dlBytes / 1048576).toFixed(0)}/${(j.dlTotal / 1048576).toFixed(0)}MB applied=${j.downloaded} | nes ref-lib: ${artByKey()}`;
    if (line !== last) { console.log(new Date().toISOString().slice(11, 19), line); last = line; }
    if (!j.running && j.phase !== "connecting") { done = j; break; }
  }
  await sleep(12000);
}
console.log("\nJOB", done ? `FINISHED phase=${done.phase}${done.errors?.length ? " errors=" + done.errors.join("; ") : ""}` : "(monitor timed out; job may still be running)");

try {
  const gh = new Database(path.join(ROOT, "data", "gamehub.db"), { readonly: true });
  const q = (col) => gh.prepare(`SELECT COUNT(*) c FROM roms WHERE platform_slug='nes' AND ${col} LIKE ?`).get("%.webp%").c;
  const tot = gh.prepare("SELECT COUNT(*) c FROM roms WHERE platform_slug='nes'").get().c;
  const sample = gh.prepare("SELECT id,title,boxart_url,logo_url FROM roms WHERE platform_slug='nes' AND boxart_url LIKE ? LIMIT 3").all("%.webp%");
  gh.close();
  console.log(`\n== FINAL ==`);
  console.log(`NES ref-lib: ${artByKey()}`);
  console.log(`NES roms (of ${tot}) with WebP: boxart=${q("boxart_url")} logo=${q("logo_url")} screenshot=${q("screenshot_url")} hero=${q("hero_url")}`);
  console.log("sample:", JSON.stringify(sample));
} catch (e) {
  console.log("verify error:", e.message);
}
try {
  const c = new Database(path.join(ROOT, "data", "gamehub.db"));
  c.prepare("DELETE FROM sessions WHERE token=?").run(token);
  c.close();
} catch {}
