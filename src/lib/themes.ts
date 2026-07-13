// deckthemes.com (CSS Loader) theme support — see docs/steamos-reference.md.
//
// Themes are zips containing theme.json + CSS written against Steam's
// gamepad UI class names. Two kinds of selectors appear:
//   1. stable classes (.DialogButton, .BasicUI, .gpfocus…) — GameHub's DOM
//      carries these already (SteamosShim), so they apply directly;
//   2. historical hashed module classes (.gamepaddialog_Button_1kn70) — at
//      install time these are rewritten to substring attribute selectors
//      ([class*="gamepaddialog_Button_"]), which match the module-style
//      hook classes GameHub puts on its equivalent surfaces (…_gh).
//
// Installed themes live in data/themes/<id>/ with the original files, the
// rewritten *.gh.css versions, and a meta.json (enabled, patch choices).

import fs from "fs";
import path from "path";
import yauzl from "yauzl";

const API = "https://api.deckthemes.com";
const THEMES_DIR = path.join(process.cwd(), "data", "themes");
const MAX_ZIP_BYTES = 30 * 1024 * 1024;

export interface ThemePatchComponent {
  name: string;
  type: string; // color-picker (the only kind CSS Loader ships)
  on: string; // patch value that activates this component
  default: string;
  css_variable: string;
}

export interface ThemePatch {
  name: string;
  type: string; // dropdown | slider | checkbox | none
  default: string;
  values: Record<string, Record<string, string[]>>; // value -> {cssFile: tabs}
  components?: ThemePatchComponent[];
}

export interface ThemeMeta {
  id: string;
  name: string;
  author: string;
  version: string;
  target: string;
  description?: string;
  inject: Record<string, string[]>; // cssFile -> tabs
  patches: ThemePatch[];
  selected: Record<string, string>; // patchName -> chosen value
  componentValues?: Record<string, string>; // componentName -> value (e.g. a color)
  /** Declared dependencies from theme.json: depName -> forced patch values.
   *  Resolved BY NAME at toggle time, exactly like CSS Loader. */
  dependencies?: Record<string, Record<string, string>>;
  /** manifest flags (e.g. KEEP_DEPENDENCIES, PRESET) */
  flags?: string[];
  /** Set when this theme was auto-installed as a dependency of another —
   *  only used to clean it up when that theme is uninstalled. */
  dependencyOf?: string | null;
  enabled: boolean;
  installedAt: string;
}

const rev = globalThis as unknown as { __themesRev?: number; __themesCache?: { key: number; css: string } };

function bump() {
  rev.__themesRev = (rev.__themesRev ?? 0) + 1;
  rev.__themesCache = undefined;
}

// ---------------------------------------------------------------- rewrite

/** `.module_Class_hash` → `[class*="module_Class_"]` so both real theme
 *  hashes and GameHub's `module_Class_gh` hook classes match. Stable
 *  classes (Uppercase start, no hash) pass through untouched.
 *
 *  Steam's webpack css-loader hashes are 5 base64url chars and may contain
 *  `_` or `-` (e.g. `S-_La`, `14_HB`, `MVc_6`), and class names may have
 *  several parts (`gamepadpagedsettings_PagedSettingsDialog_PageListItem`).
 *  Pass 1 handles that exact form; pass 2 keeps the legacy loose form
 *  (simple 3-12 char hash, no underscore) for older themes. */
export function rewriteThemeCss(css: string): string {
  return css
    .replace(
      /\.([a-z][a-z0-9]*(?:_[A-Za-z][A-Za-z0-9]*)+)_([A-Za-z0-9_-]{5})(?![\w-])/g,
      '[class*="$1_"]'
    )
    .replace(
      /\.([a-z][a-z0-9]*(?:_[A-Za-z][A-Za-z0-9]*)+)_([A-Za-z0-9-]{3,12})(?![\w-])/g,
      '[class*="$1_"]'
    );
}

// ---------------------------------------------------------------- deckthemes API

/** Available CSS browse filters (System-Wide, Tweak, Snippet, …) with counts */
export async function deckThemesFilters(): Promise<Record<string, number>> {
  const res = await fetch(`${API}/themes/filters?type=CSS`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`deckthemes API: HTTP ${res.status}`);
  const data = await res.json();
  return data.filters ?? {};
}

export async function searchDeckThemes(
  query: string,
  page = 1,
  order = "Most Downloaded",
  filter = ""
) {
  // filters=CSS.<target> scopes to one target (Tweaks, Snippets, …);
  // bare "CSS." means every CSS theme
  const filters = `CSS.${filter && filter !== "All" ? filter : ""}`;
  const url = `${API}/themes?filters=${encodeURIComponent(filters)}&perPage=12&page=${page}&order=${encodeURIComponent(order)}${query ? `&search=${encodeURIComponent(query)}` : ""}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`deckthemes API: HTTP ${res.status}`);
  const data = await res.json();
  const installed = new Set(listInstalledThemes().map((t) => t.id));
  interface ApiTheme {
    id: string;
    displayName?: string;
    name: string;
    specifiedAuthor?: string;
    version?: string;
    target?: string;
    starCount?: number;
    images?: { id: string }[];
    download?: { id: string; downloadCount?: number };
  }
  return {
    total: data.total ?? 0,
    items: ((data.items ?? []) as ApiTheme[]).map((t) => ({
      id: t.id,
      name: t.displayName || t.name,
      author: t.specifiedAuthor ?? "",
      version: t.version ?? "",
      target: t.target ?? "",
      stars: t.starCount ?? 0,
      downloads: t.download?.downloadCount ?? 0,
      imageId: t.images?.[0]?.id ?? null,
      installed: installed.has(t.id),
    })),
  };
}

// ---------------------------------------------------------------- install

function extractZip(zipPath: string, dest: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const written: string[] = [];
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("bad zip"));
      zip.on("error", reject);
      zip.readEntry();
      zip.on("entry", (entry: yauzl.Entry) => {
        const name = entry.fileName.replace(/\\/g, "/");
        if (name.endsWith("/") || name.includes("..") || path.isAbsolute(name)) {
          zip.readEntry();
          return;
        }
        // strip the single top-level folder ("Round/shared.css" -> "shared.css")
        const rel = name.includes("/") ? name.slice(name.indexOf("/") + 1) : name;
        if (!rel) {
          zip.readEntry();
          return;
        }
        const target = path.join(dest, rel);
        if (!target.startsWith(dest)) {
          zip.readEntry();
          return;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        zip.openReadStream(entry, (err2, stream) => {
          if (err2 || !stream) return reject(err2 ?? new Error("bad zip entry"));
          const out = fs.createWriteStream(target);
          stream.pipe(out);
          out.on("finish", () => {
            written.push(rel);
            zip.readEntry();
          });
          out.on("error", reject);
        });
      });
      zip.on("end", () => resolve(written));
    });
  });
}

export async function installTheme(
  id: string,
  depth = 0,
  dependencyOf: string | null = null
): Promise<ThemeMeta> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid theme id");

  const detailRes = await fetch(`${API}/themes/${id}`, { signal: AbortSignal.timeout(15000) });
  if (!detailRes.ok) throw new Error(`Theme not found (HTTP ${detailRes.status})`);
  const detail = await detailRes.json();
  const blobId = detail?.download?.id;
  if (!blobId) throw new Error("Theme has no download");

  const blobRes = await fetch(`${API}/blobs/${blobId}`, { signal: AbortSignal.timeout(60000) });
  if (!blobRes.ok) throw new Error(`Download failed (HTTP ${blobRes.status})`);
  const buf = Buffer.from(await blobRes.arrayBuffer());
  if (buf.length > MAX_ZIP_BYTES) throw new Error("Theme download too large");

  const dir = path.join(THEMES_DIR, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const zipPath = path.join(dir, ".download.zip");
  fs.writeFileSync(zipPath, buf);
  const files = await extractZip(zipPath, dir);
  fs.rmSync(zipPath, { force: true });

  // manifest
  let manifest: {
    name?: string;
    author?: string;
    version?: string;
    description?: string;
    inject?: Record<string, string[]>;
    dependencies?: Record<string, Record<string, string>>;
    flags?: string[];
    patches?: Record<
      string,
      {
        default?: string;
        type?: string;
        values?: Record<string, Record<string, string[]>>;
        components?: { name?: string; type?: string; on?: string; default?: string; css_variable?: string }[];
      }
    >;
  } = {};
  const manifestPath = path.join(dir, "theme.json");
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {}
  }

  // no inject map -> use every top-level css file
  let inject = manifest.inject ?? {};
  if (Object.keys(inject).length === 0) {
    inject = Object.fromEntries(
      files.filter((f) => f.endsWith(".css") && !f.includes("/")).map((f) => [f, ["SP"]])
    );
  }

  const patches: ThemePatch[] = Object.entries(manifest.patches ?? {}).map(([name, p]) => ({
    name,
    type: p.type ?? "dropdown",
    default: p.default ?? Object.keys(p.values ?? {})[0] ?? "",
    values: p.values ?? {},
    components: (p.components ?? [])
      .filter((c) => c.name && c.css_variable)
      .map((c) => ({
        name: c.name!,
        type: c.type ?? "color-picker",
        on: c.on ?? "",
        default: c.default ?? "#ffffff",
        css_variable: c.css_variable!,
      })),
  }));

  // rewrite every css file once at install time
  for (const f of files) {
    if (!f.endsWith(".css")) continue;
    const src = path.join(dir, f);
    try {
      fs.writeFileSync(src + ".gh", rewriteThemeCss(fs.readFileSync(src, "utf8")));
    } catch {}
  }

  const meta: ThemeMeta = {
    id,
    name: detail.displayName || detail.name || manifest.name || "Theme",
    author: detail.specifiedAuthor || manifest.author || "",
    version: detail.version || manifest.version || "",
    target: detail.target ?? "",
    description: manifest.description,
    inject,
    patches,
    selected: Object.fromEntries(patches.map((p) => [p.name, p.default])),
    componentValues: Object.fromEntries(
      patches.flatMap((p) => (p.components ?? []).map((c) => [c.name, c.default]))
    ),
    dependencies: manifest.dependencies ?? {},
    flags: (manifest.flags ?? []).map((f) => String(f).toUpperCase()),
    dependencyOf,
    enabled: true,
    installedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  bump();

  // CSS Loader auto-installs a theme's dependencies (theme.json lists them
  // by display name) — e.g. Pip-Boy depends on "Colored Toggles". Themes
  // flagged OPTIONAL_DEPENDENCIES only suggest theirs, so skip those.
  // Failures are non-fatal: the main theme still works, just less completely.
  const deps = Object.keys(manifest.dependencies ?? {});
  const depsOptional = (manifest.flags ?? [])
    .map((f) => String(f).toUpperCase())
    .includes("OPTIONAL_DEPENDENCIES");
  if (deps.length > 0 && depth < 3 && !depsOptional) {
    const installedNames = new Set(listInstalledThemes().map((t) => t.name));
    for (const depName of deps) {
      if (installedNames.has(depName)) continue;
      try {
        const res = await fetch(
          `${API}/themes?target=CSS&perPage=10&search=${encodeURIComponent(depName)}`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (!res.ok) continue;
        const data = await res.json();
        interface Item { id: string; displayName?: string; name: string }
        const match = ((data.items ?? []) as Item[]).find(
          (x) => (x.displayName || x.name) === depName
        );
        if (match) await installTheme(match.id, depth + 1, id);
      } catch {
        // dependency install is best-effort
      }
    }
  }
  return meta;
}

// ---------------------------------------------------------------- manage

export function listInstalledThemes(): ThemeMeta[] {
  if (!fs.existsSync(THEMES_DIR)) return [];
  const out: ThemeMeta[] = [];
  for (const e of fs.readdirSync(THEMES_DIR, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(THEMES_DIR, e.name, "meta.json"), "utf8")));
    } catch {}
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function readMeta(id: string): ThemeMeta {
  return JSON.parse(fs.readFileSync(path.join(THEMES_DIR, id, "meta.json"), "utf8"));
}

function writeMeta(meta: ThemeMeta) {
  fs.writeFileSync(
    path.join(THEMES_DIR, meta.id, "meta.json"),
    JSON.stringify(meta, null, 2)
  );
}

/** CSS Loader's _enable_theme: enabling a theme first enables every declared
 *  dependency (resolved BY NAME against installed themes, recursively), and
 *  the parent may force patch values on them. An ignore list keeps the top
 *  level in control when nested deps re-declare the same dependency. */
function enableTheme(meta: ThemeMeta, setDepsValue = true, ignore: string[] = []) {
  const depNames = Object.keys(meta.dependencies ?? {});
  const ignoreNext = [...ignore, ...depNames];
  const isPreset = (meta.flags ?? []).includes("PRESET");
  for (const depName of depNames) {
    if (ignore.includes(depName)) continue;
    const dep = listInstalledThemes().find((t) => t.name === depName);
    if (!dep) continue;
    if (setDepsValue && !isPreset) {
      const forced = meta.dependencies?.[depName] ?? {};
      for (const [patchName, patchValue] of Object.entries(forced)) {
        const patch = dep.patches.find((p) => p.name === patchName);
        if (patch && patch.values[patchValue] !== undefined) {
          dep.selected[patchName] = patchValue;
        }
      }
    }
    enableTheme(dep, setDepsValue && !isPreset, ignoreNext);
  }
  meta.enabled = true;
  writeMeta(meta);
}

/** CSS Loader's _disable_theme: disabling a theme also disables its declared
 *  dependencies, unless the theme carries KEEP_DEPENDENCIES or another
 *  still-enabled theme declares the same dependency. */
function disableTheme(meta: ThemeMeta) {
  meta.enabled = false;
  writeMeta(meta);
  if ((meta.flags ?? []).includes("KEEP_DEPENDENCIES")) return;
  for (const depName of Object.keys(meta.dependencies ?? {})) {
    const dep = listInstalledThemes().find((t) => t.name === depName);
    if (!dep) continue;
    const usedByOther = listInstalledThemes().some(
      (t) => t.id !== meta.id && t.enabled && depName in (t.dependencies ?? {})
    );
    if (!usedByOther) disableTheme(dep);
  }
}

export function updateTheme(
  id: string,
  changes: {
    enabled?: boolean;
    selected?: Record<string, string>;
    componentValues?: Record<string, string>;
  }
): ThemeMeta {
  const meta = readMeta(id);
  if (changes.selected) {
    for (const patch of meta.patches) {
      const v = changes.selected[patch.name];
      if (v !== undefined && (v === "" || patch.values[v] !== undefined)) {
        meta.selected[patch.name] = v;
      }
    }
  }
  if (changes.componentValues) {
    meta.componentValues ??= {};
    const known = new Set(
      meta.patches.flatMap((p) => (p.components ?? []).map((c) => c.name))
    );
    for (const [name, value] of Object.entries(changes.componentValues)) {
      if (known.has(name) && typeof value === "string" && value.length <= 64) {
        meta.componentValues[name] = value;
      }
    }
  }
  writeMeta(meta);
  if (changes.enabled === true) enableTheme(meta);
  else if (changes.enabled === false) disableTheme(meta);
  bump();
  return readMeta(id);
}

export function deleteTheme(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid theme id");
  // disable first so dependency disable-cascade runs (CSS Loader deletes via
  // remove()), then clean up deps that were auto-installed just for this
  // theme and aren't declared by any other installed theme
  try {
    disableTheme(readMeta(id));
  } catch {}
  for (const dep of listInstalledThemes()) {
    if (dep.dependencyOf !== id) continue;
    const otherParent = listInstalledThemes().find(
      (t) => t.id !== id && t.id !== dep.id && dep.name in (t.dependencies ?? {})
    );
    if (!otherParent) {
      fs.rmSync(path.join(THEMES_DIR, dep.id), { recursive: true, force: true });
    } else {
      // shared dep survives — re-parent it so it's still cleaned up when its
      // remaining dependent is uninstalled later
      dep.dependencyOf = otherParent.id;
      writeMeta(dep);
    }
  }
  fs.rmSync(path.join(THEMES_DIR, id), { recursive: true, force: true });
  bump();
}

// ---------------------------------------------------------------- compile

import { getSetting, setSetting } from "./db";

export function setCustomCss(css: string) {
  setSetting("custom_css", css);
  bump();
}

export function getCustomCss(): string {
  return getSetting("custom_css") ?? "";
}

/** CSS Loader's load order: every theme that depends on D pushes D earlier
 *  (score - 1 per dependent, recursively), so dependencies compile FIRST and
 *  a theme's own CSS can override what its dependencies set. A PRIORITY file
 *  in the theme folder seeds the score. */
function orderThemes(themes: ThemeMeta[]): ThemeMeta[] {
  const scores = new Map<string, number>();
  const seed = (meta: ThemeMeta, depth: number) => {
    if (depth > 4) return;
    if (!scores.has(meta.name)) {
      let mod = 0;
      try {
        mod = parseInt(
          fs.readFileSync(path.join(THEMES_DIR, meta.id, "PRIORITY"), "utf8").trim(),
          10
        ) || 0;
      } catch {}
      scores.set(meta.name, mod);
    }
    for (const depName of Object.keys(meta.dependencies ?? {})) {
      const dep = themes.find((t) => t.name === depName);
      if (!dep) continue;
      seed(dep, depth + 1);
      scores.set(dep.name, (scores.get(dep.name) ?? 0) - 1);
    }
  };
  for (const t of themes) seed(t, 0);
  return [...themes].sort((a, b) => (scores.get(a.name) ?? 0) - (scores.get(b.name) ?? 0));
}

/** CSS Loader injects each file into specific Steam UI TABS/windows (the
 *  `string[]` in inject/patch maps), not one global sheet. "All"/"SP" = the
 *  main window (global for us). "QuickAccess"/"MainMenu" are SEPARATE overlays
 *  on the real Deck — their CSS (e.g. QuickAccess.css's global
 *  `[gamepaddialog_Button_]{background:accent}`) must NOT bleed into the main
 *  page. GameHub renders those as component subtrees, so we scope such files to
 *  the matching component root (a `.gh-tab-*` class on its outer element). */
function tabScope(tabs: string[]): string | null {
  if (!tabs || tabs.length === 0) return null;
  if (tabs.some((t) => t === "All" || t === "SP")) return null; // global
  if (tabs.includes("QuickAccess")) return ".gh-tab-quickaccess";
  if (tabs.includes("MainMenu")) return ".gh-tab-mainmenu";
  return null; // unrecognized tab → leave global (prior behavior)
}

/** Prefix every top-level style-rule selector with `scope ` so a tab-scoped
 *  file only applies inside that component. At-rules pass through (@media/
 *  @supports/@container recurse; @keyframes/@font-face untouched); `:root`/
 *  `html`/`body` remap to the scope itself. Naive comma-split — fine for
 *  deckthemes CSS (attribute selectors), not `:is(a,b)` preludes. */
function scopeCss(css: string, scope: string): string {
  const out: string[] = [];
  const n = css.length;
  let i = 0;
  while (i < n) {
    const start = i;
    let j = i;
    let brace = -1;
    while (j < n) {
      const c = css[j];
      if (c === "/" && css[j + 1] === "*") {
        const end = css.indexOf("*/", j + 2);
        j = end === -1 ? n : end + 2;
        continue;
      }
      if (c === "{" || c === "}" || c === ";") { brace = c === "{" ? j : -1; break; }
      j++;
    }
    if (j >= n && brace === -1) { out.push(css.slice(start)); break; }
    if (brace === -1) {
      // stray '}' or an `@import …;` statement — pass through
      out.push(css.slice(start, j + 1));
      i = j + 1;
      continue;
    }
    const prelude = css.slice(start, brace);
    let depth = 1;
    let k = brace + 1;
    while (k < n && depth > 0) {
      const c = css[k];
      if (c === "/" && css[k + 1] === "*") {
        const end = css.indexOf("*/", k + 2);
        k = end === -1 ? n : end + 2;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      k++;
    }
    const block = css.slice(brace + 1, k - 1);
    const trimmed = prelude.trim();
    if (trimmed.startsWith("@")) {
      const lower = trimmed.toLowerCase();
      if (lower.startsWith("@media") || lower.startsWith("@supports") || lower.startsWith("@container")) {
        out.push(prelude + "{" + scopeCss(block, scope) + "}");
      } else {
        out.push(prelude + "{" + block + "}");
      }
    } else {
      const scopedSel = prelude
        .split(",")
        .map((sel) => {
          const s = sel.trim();
          if (!s) return "";
          if (s === ":root" || s === "html" || s === "body" || s === "*") return scope;
          return scope + " " + s;
        })
        .filter(Boolean)
        .join(", ");
      out.push(scopedSel + " {" + block + "}");
    }
    i = k;
  }
  return out.join("");
}

/** Concatenated CSS of all enabled themes (+ the admin's custom CSS),
 *  memoized until any theme mutation. Injected inline by the root layout. */
export function compiledThemeCss(): string {
  const key = rev.__themesRev ?? 0;
  if (rev.__themesCache && rev.__themesCache.key === key) return rev.__themesCache.css;

  const parts: string[] = [];
  for (const meta of orderThemes(listInstalledThemes())) {
    if (!meta.enabled) continue;
    const dir = path.join(THEMES_DIR, meta.id);
    // each file carries its inject TABS (from inject map + active patch values)
    const fileEntries: { file: string; tabs: string[] }[] = [];
    for (const [f, tabs] of Object.entries(meta.inject)) fileEntries.push({ file: f, tabs });
    for (const patch of meta.patches) {
      const value = meta.selected[patch.name] ?? patch.default;
      const valueFiles = patch.values[value];
      if (valueFiles) for (const [f, tabs] of Object.entries(valueFiles)) fileEntries.push({ file: f, tabs });
    }
    for (const { file, tabs } of fileEntries) {
      const safe = file.replace(/\\/g, "/");
      if (safe.includes("..") || path.isAbsolute(safe)) continue;
      const rewritten = path.join(dir, safe + ".gh");
      const original = path.join(dir, safe);
      try {
        const css = fs.readFileSync(fs.existsSync(rewritten) ? rewritten : original, "utf8");
        const scope = tabScope(tabs);
        const finalCss = scope ? scopeCss(css, scope) : css;
        parts.push(`/* == theme: ${meta.name} — ${safe}${scope ? ` [${scope}]` : ""} == */\n${finalCss}`);
      } catch {}
    }

    // patch components (CSS Loader color pickers): when the owning patch is
    // set to the component's "on" value, inject its css_variable override
    const vars: string[] = [];
    for (const patch of meta.patches) {
      const value = meta.selected[patch.name] ?? patch.default;
      for (const c of patch.components ?? []) {
        if (c.on !== value) continue;
        const v = (meta.componentValues?.[c.name] ?? c.default).replace(/[;{}]/g, "");
        const name = c.css_variable.replace(/^--/, "").replace(/[^a-zA-Z0-9_-]/g, "");
        if (name) vars.push(`  --${name}: ${v} !important;`);
      }
    }
    if (vars.length > 0) {
      parts.push(`/* == theme: ${meta.name} — component variables == */\n:root {\n${vars.join("\n")}\n}`);
    }
  }
  const custom = getCustomCss();
  if (custom.trim()) parts.push(`/* == custom css == */\n${custom}`);

  const css = parts.join("\n\n");
  rev.__themesCache = { key, css };
  return css;
}
