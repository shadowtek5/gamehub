// Node-only filesystem watcher for the library. Kept in its own module so it can
// be started at server boot AND restarted at runtime when the "Watch folders for
// changes" automation toggle flips (or the watched paths change) — without a
// server restart. The `fs` import must never reach the Edge bundle, so only
// import this from Node runtimes (server startup + Node API routes).
//
// Hybrid strategy — real-time where we can, polling where we must:
//   • Local disks   → fs.watch (recursive), event-driven and instant.
//   • Network shares → bounded per-directory-signature polling.
//   • Containers     → polling for everything: Docker bind/volume mounts don't
//     reliably deliver inotify events (see forcePollAllRoots).
// Why the split: GameHub libraries commonly live on a NAS / SMB share (the
// reference setup mounts \\host\emulation\roms). Node's fs.watch on Windows uses
// ReadDirectoryChangesW, which does NOT deliver change events for UNC/network
// paths — a recursive watch there creates fine but then emits an "UNKNOWN" error
// the moment anything changes, and never fires a usable event. So we route
// obvious UNC paths straight to polling, and for anything else we attach an error
// handler so a share that only reveals itself at runtime self-heals into polling.
//
// Scoped scans: whichever mechanism detects the change, we resolve the changed
// path to the system folder that contains it and queue a scan for just that
// platform (e.g. a ROM dropped in "Nintendo Game Boy" scans `gb`, not the whole
// library). Changes we can't map to a system fall back to a full scan.

import fs from "fs";
import path from "path";
import { getSetting, getLibraryPaths, getSystemFolders } from "./db";
import { enqueueScan, scanPendingOrRunning } from "./jobQueue";

const DEFAULT_INTERVAL_SEC = 120;
const MIN_INTERVAL_SEC = 30;
const MAX_DEPTH = 4; // catches …/System/Game/Disc/file — deep enough for any console layout
const IGNORE_RE = /\.(ds_store|tmp|part|crdownload)$/i;

let watchers: fs.FSWatcher[] = [];
let poller: NodeJS.Timeout | null = null;
let debounce: NodeJS.Timeout | null = null;
let prevDirSig: Map<string, number> | null = null;
let polling = false;
let started = false;
// Accumulated across the debounce window so one flurry of changes → one scan.
const pendingSlugs = new Set<string>();
let pendingFull = false;
// Roots that fs.watch accepted but then errored at runtime — routed to polling on
// the next (re)start so we don't keep retrying a watch that can't work.
const forcePoll = new Set<string>();

/** Stop all watchers, stop polling, and cancel any pending debounced scan. */
export function stopWatcher() {
  for (const w of watchers) {
    try {
      w.close();
    } catch {
      // already closed
    }
  }
  watchers = [];
  if (poller) {
    clearInterval(poller);
    poller = null;
  }
  if (debounce) {
    clearTimeout(debounce);
    debounce = null;
  }
  prevDirSig = null;
  pendingSlugs.clear();
  pendingFull = false;
  if (started) console.log("[watcher] stopped");
  started = false;
}

const normKey = (p: string) => p.replace(/[\\/]+$/, "").toLowerCase();

/** UNC path (\\server\share or //server/share) — never watchable via fs.watch. */
function isUncPath(p: string): boolean {
  return /^(\\\\|\/\/)/.test(p);
}

/**
 * Running inside a container? Docker bind/volume mounts routinely do NOT deliver
 * inotify events for host-side changes — Docker Desktop's file-sharing layer
 * (virtiofs/gRPC-FUSE) doesn't forward them, and network-backed volumes can't.
 * fs.watch there succeeds but stays silent, so we poll instead — the same
 * conclusion Vite/webpack reach (CHOKIDAR_USEPOLLING).
 *
 * Override with GAMEHUB_WATCH_POLL=0 to force real-time (safe on a Linux-native
 * Docker host with a local bind mount, where inotify does work), or =1 to force
 * polling anywhere.
 */
function forcePollAllRoots(): { poll: boolean; why: string } {
  const env = (process.env.GAMEHUB_WATCH_POLL ?? "").trim().toLowerCase();
  if (env === "1" || env === "true" || env === "yes") return { poll: true, why: "GAMEHUB_WATCH_POLL=1" };
  if (env === "0" || env === "false" || env === "no") return { poll: false, why: "GAMEHUB_WATCH_POLL=0" };
  try {
    if (fs.existsSync("/.dockerenv")) return { poll: true, why: "/.dockerenv" };
    if (fs.existsSync("/run/.containerenv")) return { poll: true, why: "/run/.containerenv" };
    if (process.env.container) return { poll: true, why: `container=${process.env.container}` };
    // cgroup signatures — catches container runtimes that don't drop a marker
    // file (some containerd / k8s / older Synology setups). cgroup v2 often
    // shows only "0::/" inside a container, so this is best-effort on top of
    // the marker-file checks above.
    try {
      const cg = fs.readFileSync("/proc/1/cgroup", "utf8");
      if (/docker|containerd|kubepods|libpod|lxc/i.test(cg)) return { poll: true, why: "cgroup" };
    } catch {
      // /proc not present (e.g. Windows/macOS host) — not a Linux container
    }
  } catch {
    // fall through
  }
  return { poll: false, why: "no container detected" };
}

/** Order-independent 32-bit hash of a string. */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Build a resolver mapping an absolute path to the platform slug of the system
 * folder that contains it (longest-prefix match), or null when it's under no
 * configured system folder. Folders are captured once per (re)start; path/folder
 * changes trigger a restart, so the snapshot stays current.
 */
function makeResolver(): (abs: string) => string | null {
  const folders = getSystemFolders()
    .map((f) => ({ slug: f.platform_slug, key: normKey(f.path) }))
    .sort((a, b) => b.key.length - a.key.length); // longest (most specific) first
  return (abs: string) => {
    const k = normKey(abs);
    for (const f of folders) {
      if (k === f.key || k.startsWith(f.key + "/") || k.startsWith(f.key + "\\")) return f.slug;
    }
    return null;
  };
}

/**
 * Walk `dir` to `MAX_DEPTH`, recording each directory's own (non-recursive) entry
 * signature into `out` keyed by absolute path. Directory-listing only — no
 * per-file stat, so it stays cheap over a network share. Adding/removing/renaming
 * a file flips exactly the signature of the directory it lives in, which is how
 * we later pinpoint which system changed. Unreadable dirs are skipped.
 */
async function walk(dir: string, depth: number, out: Map<string, number>) {
  let ents: fs.Dirent[];
  try {
    ents = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  let local = ents.length; // seed with count so add+rename that keeps count still differs below
  const subdirs: string[] = [];
  for (const e of ents) {
    local = (local + hashStr(e.name)) % Number.MAX_SAFE_INTEGER; // sum → order-independent
    let isDir = e.isDirectory();
    // Container bind mounts (virtiofs / gRPC-FUSE) and some network/overlay
    // filesystems hand back entries with an UNKNOWN d_type, so isDirectory()
    // is false for real folders — and we'd never descend into the per-system
    // folders where ROMs live, missing every add/remove inside them. Only the
    // ambiguous entries (unknown type, or a symlinked folder) fall back to a
    // stat; a normal file short-circuits on isFile(), so local disks stay cheap.
    if (!isDir && !e.isFile()) {
      try {
        isDir = (await fs.promises.stat(path.join(dir, e.name))).isDirectory();
      } catch {
        // vanished/unreadable — treat as not a directory
      }
    }
    if (isDir) subdirs.push(e.name);
  }
  out.set(dir, local);
  if (depth >= MAX_DEPTH) return;
  for (const name of subdirs) await walk(path.join(dir, name), depth + 1, out);
}

/** Directories that appeared, vanished, or whose contents changed between polls. */
function changedDirs(prev: Map<string, number>, next: Map<string, number>): string[] {
  const changed: string[] = [];
  for (const [dir, sig] of next) if (prev.get(dir) !== sig) changed.push(dir);
  for (const dir of prev.keys()) if (!next.has(dir)) changed.push(dir);
  return changed;
}

/** Collapse roots to the topmost ones — drop any path nested inside another. */
function dedupeRoots(paths: string[]): string[] {
  const uniq = Array.from(new Set(paths.map((p) => p.trim()).filter(Boolean)));
  return uniq.filter((p) => {
    const np = normKey(p);
    return !uniq.some((other) => {
      if (other === p) return false;
      const no = normKey(other);
      return np.startsWith(no + "/") || np.startsWith(no + "\\");
    });
  });
}

function intervalMs(): number {
  const raw = Number(getSetting("fs_watch_interval_sec"));
  const sec = Number.isFinite(raw) && raw > 0 ? Math.max(MIN_INTERVAL_SEC, raw) : DEFAULT_INTERVAL_SEC;
  return sec * 1000;
}

/**
 * (Re)start the watcher from current settings. No-op (after stopping) when the
 * `fs_watcher` setting is not "on". Safe to call repeatedly — it always tears
 * down existing state first, so it doubles as "reload from settings / paths".
 */
export function startWatcher() {
  stopWatcher();
  if (getSetting("fs_watcher") !== "on") return;

  const roots = dedupeRoots([...getLibraryPaths(), ...getSystemFolders().map((f) => f.path)]);
  if (roots.length === 0) {
    console.log("[watcher] enabled but no library paths or system folders configured — nothing to watch");
    started = true;
    return;
  }

  const ms = intervalMs();
  const resolveSlug = makeResolver();

  // Accumulate changed slugs (or a full-scan flag) across the debounce window,
  // then enqueue ONE scan scoped to just the affected systems.
  const noteChange = (abs: string | null) => {
    const slug = abs ? resolveSlug(abs) : null;
    if (slug) pendingSlugs.add(slug);
    else pendingFull = true; // couldn't map it → be safe, scan everything
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(flush, 2_000);
  };
  const flush = () => {
    debounce = null;
    const full = pendingFull;
    const slugs = [...pendingSlugs];
    pendingSlugs.clear();
    pendingFull = false;
    if (!full && slugs.length === 0) return;
    // Dedupe against the running/queued scan so bursts don't stack redundant work.
    if (scanPendingOrRunning()) return;
    if (full) {
      enqueueScan(null, null, { autoScrape: true });
      console.log("[watcher] library changed — full scan queued");
    } else {
      enqueueScan(slugs, null, { autoScrape: true });
      console.log(`[watcher] change in ${slugs.join(", ")} — scoped scan queued`);
    }
  };

  // --- partition roots: real-time fs.watch vs polling ---
  // In a container, mounted volumes don't reliably deliver inotify events, so we
  // poll everything rather than trust an fs.watch that silently never fires.
  const { poll: pollAll, why: pollWhy } = forcePollAllRoots();
  const pollRoots: string[] = [];
  const watchRoots: string[] = [];
  for (const root of roots) {
    if (pollAll || isUncPath(root) || forcePoll.has(normKey(root))) {
      pollRoots.push(root);
      continue;
    }
    try {
      const w = fs.watch(root, { recursive: true }, (_event, filename) => {
        if (filename && IGNORE_RE.test(String(filename))) return;
        // filename is relative to root; resolve to an absolute path to map it.
        noteChange(filename ? path.join(root, String(filename)) : null);
      });
      // A watch may create fine and only fail later (e.g. an SMB mount that looks
      // local). Route it to polling on the next restart and re-partition now.
      w.on("error", () => {
        forcePoll.add(normKey(root));
        console.log(`[watcher] fs.watch failed for ${root} — switching it to polling`);
        noteChange(root); // the error implies a change we'd otherwise miss
        startWatcher();
      });
      watchers.push(w);
      watchRoots.push(root);
    } catch {
      pollRoots.push(root);
    }
  }

  // --- polling loop for the network / unwatchable roots ---
  if (pollRoots.length > 0) {
    const tick = async () => {
      if (polling) return; // a slow walk over SMB can outlast the interval — don't overlap
      polling = true;
      try {
        const next = new Map<string, number>();
        for (const root of pollRoots) await walk(root, 0, next);
        if (prevDirSig === null) {
          // First pass: just a baseline, nothing to compare against yet. Log the
          // directory count so `docker logs` confirms the walk can actually read
          // the mount (0 here = the configured path isn't visible in-container).
          console.log(`[watcher] polling baseline: ${next.size} dirs across ${pollRoots.length} root(s)`);
        } else {
          for (const dir of changedDirs(prevDirSig, next)) noteChange(dir);
        }
        prevDirSig = next;
      } catch (e) {
        console.error("[watcher] poll failed:", e);
      } finally {
        polling = false;
      }
    };
    void tick(); // establish baseline immediately (no trigger on first run)
    poller = setInterval(() => void tick(), ms);
  }

  started = true;
  const parts: string[] = [];
  if (watchRoots.length) parts.push(`${watchRoots.length} watched (real-time)`);
  if (pollRoots.length) {
    parts.push(`${pollRoots.length} polled every ${Math.round(ms / 1000)}s (${pollWhy})`);
  }
  console.log(`[watcher] ${parts.join(", ")} — roots: ${roots.join(", ")}`);
}

/** Alias that reads clearly at call sites reacting to a settings/paths change. */
export const restartWatcher = startWatcher;
