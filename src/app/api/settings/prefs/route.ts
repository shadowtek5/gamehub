import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/db";

/** Small admin preferences (auto_scan on/off) */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json({
    autoScan: getSetting("auto_scan") !== "off",
    autoCleanup: getSetting("auto_cleanup") === "on",
    lastAutoScan: getSetting("last_auto_scan"),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.autoScan === "boolean") {
    setSetting("auto_scan", body.autoScan ? "on" : "off");
  }
  if (typeof body.autoCleanup === "boolean") {
    setSetting("auto_cleanup", body.autoCleanup ? "on" : "off");
  }
  if (typeof body.fsWatcher === "boolean") {
    setSetting("fs_watcher", body.fsWatcher ? "on" : "off");
  }
  if (body.setupComplete === true) {
    setSetting("setup_complete", "on");
  }
  return NextResponse.json({
    ok: true,
    autoScan: getSetting("auto_scan") !== "off",
    autoCleanup: getSetting("auto_cleanup") === "on",
  });
}
