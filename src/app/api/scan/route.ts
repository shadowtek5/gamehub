import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSetting } from "@/lib/db";
import { scanLibrary } from "@/lib/scanner";
import { runCleanup } from "@/lib/cleanup";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const systems = Array.isArray(body?.systems)
    ? body.systems.filter((s: unknown) => typeof s === "string")
    : undefined;
  const result = scanLibrary({ systems });

  // Auto cleanup: immediately remove whatever this scan marked missing
  // (scoped to the scanned systems on a partial scan)
  let cleanup: { removedGames: number; removedMediaFolders: number } | undefined;
  if (getSetting("auto_cleanup") === "on" && result.markedMissing > 0) {
    cleanup = runCleanup(systems ?? []);
  }
  return NextResponse.json({ ...result, cleanup });
}
