import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSetting, setSetting, isExternalNewsEnabled } from "@/lib/db";
import { getBackupStatus, setBackupConfig, runBackupNow } from "@/lib/autoBackup";
import { enqueueScan } from "@/lib/jobQueue";
import { runCleanup } from "@/lib/cleanup";
import { refreshFeeds } from "@/lib/news/external";
import { logEvent } from "@/lib/eventLog";
import type { BackupParts } from "@/lib/backup";

function intHours(v: unknown, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(24 * 30, n) : fallback;
}

function snapshot() {
  return {
    scan: {
      enabled: getSetting("auto_scan") !== "off",
      intervalHours: Number(getSetting("scan_interval_hours")) || 24,
      lastAt: getSetting("last_auto_scan") || null,
    },
    cleanup: { enabled: getSetting("auto_cleanup") === "on" },
    watcher: { enabled: getSetting("fs_watcher") === "on" },
    news: {
      enabled: isExternalNewsEnabled(),
      intervalHours: Number(getSetting("news_interval_hours")) || 6,
    },
    backup: getBackupStatus(),
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json(snapshot());
}

/** Update automation config, or trigger a task now via { run: "..." }. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  // ---- run-now actions ----
  if (typeof body.run === "string") {
    try {
      switch (body.run) {
        case "scan":
          enqueueScan(null, { id: user.id, name: user.username });
          break;
        case "cleanup": {
          const r = runCleanup();
          logEvent({
            category: "maintenance",
            action: "maintenance.cleanup",
            summary: `Cleanup removed ${r.removedGames} missing game${r.removedGames === 1 ? "" : "s"}`,
            detail: { removedGames: r.removedGames, removedMediaFolders: r.removedMediaFolders },
            actor: user,
          });
          return NextResponse.json({ ok: true, message: `Removed ${r.removedGames} missing game(s).`, ...snapshot() });
        }
        case "news":
          await refreshFeeds();
          break;
        case "backup": {
          const r = await runBackupNow();
          logEvent({
            category: "maintenance",
            action: "maintenance.backup",
            summary: `Backup written (${(r.size / 1e6).toFixed(1)} MB)`,
            detail: { file: r.file, size: r.size },
            actor: user,
          });
          return NextResponse.json({ ok: true, message: `Backup written: ${r.file}`, ...snapshot() });
        }
        default:
          return NextResponse.json({ error: "Unknown action" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, ...snapshot() });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  // ---- config updates ----
  const changed = Object.keys(body).filter((k) =>
    ["scanEnabled", "scanIntervalHours", "cleanupEnabled", "watcherEnabled", "newsIntervalHours", "backup"].includes(k)
  );
  if (typeof body.scanEnabled === "boolean") setSetting("auto_scan", body.scanEnabled ? "on" : "off");
  if (body.scanIntervalHours !== undefined)
    setSetting("scan_interval_hours", String(intHours(body.scanIntervalHours, 24)));
  if (typeof body.cleanupEnabled === "boolean") setSetting("auto_cleanup", body.cleanupEnabled ? "on" : "off");
  if (typeof body.watcherEnabled === "boolean") {
    setSetting("fs_watcher", body.watcherEnabled ? "on" : "off");
    // Apply immediately — the watcher is (re)started/stopped from current
    // settings so the toggle takes effect without a server restart.
    const { restartWatcher } = await import("@/lib/fsWatcher");
    restartWatcher();
  }
  if (body.newsIntervalHours !== undefined)
    setSetting("news_interval_hours", String(intHours(body.newsIntervalHours, 6)));

  if (body.backup && typeof body.backup === "object") {
    const b = body.backup as {
      enabled?: boolean;
      intervalHours?: number;
      dir?: string;
      keep?: number;
      parts?: Partial<BackupParts>;
    };
    setBackupConfig({
      ...(typeof b.enabled === "boolean" ? { enabled: b.enabled } : {}),
      ...(b.intervalHours !== undefined ? { intervalHours: intHours(b.intervalHours, 24) } : {}),
      ...(typeof b.dir === "string" ? { dir: b.dir } : {}),
      ...(b.keep !== undefined ? { keep: Math.round(Number(b.keep)) || 7 } : {}),
      ...(b.parts
        ? {
            parts: {
              saves: !!b.parts.saves,
              firmware: !!b.parts.firmware,
              media: !!b.parts.media,
              launchbox: !!b.parts.launchbox,
            },
          }
        : {}),
    });
  }

  if (changed.length) {
    logEvent({
      category: "settings",
      action: "settings.changed",
      summary: `Updated automation settings (${changed.join(", ")})`,
      detail: { changed },
      actor: user,
    });
  }

  return NextResponse.json({ ok: true, ...snapshot() });
}
