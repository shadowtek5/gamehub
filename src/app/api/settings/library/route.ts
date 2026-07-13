import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getSessionUser } from "@/lib/auth";
import { getLibraryPaths, setSetting } from "@/lib/db";
import { logEvent } from "@/lib/eventLog";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ paths: getLibraryPaths() });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { paths } = await req.json().catch(() => ({}));
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== "string")) {
    return NextResponse.json({ error: "paths must be an array of strings" }, { status: 400 });
  }
  const cleaned = paths.map((p: string) => p.trim()).filter(Boolean);
  const invalid = cleaned.filter((p) => !fs.existsSync(p));
  setSetting("library_paths", JSON.stringify(cleaned));
  // Re-point the filesystem watcher at the new set of roots (no-op if it's off).
  (await import("@/lib/fsWatcher")).restartWatcher();
  logEvent({
    category: "settings",
    action: "settings.changed",
    summary: `Updated library folders (${cleaned.length} path${cleaned.length === 1 ? "" : "s"})`,
    detail: { paths: cleaned },
    actor: user,
  });
  return NextResponse.json({ ok: true, paths: cleaned, invalid });
}
