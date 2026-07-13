import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getSessionUser } from "@/lib/auth";
import {
  getSystemFolders,
  setSystemFolders,
  getHiddenSystems,
  setHiddenSystems,
} from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";
import { logEvent } from "@/lib/eventLog";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json({
    folders: getSystemFolders(),
    hidden: [...getHiddenSystems()],
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { folders } = await req.json().catch(() => ({}));
  if (!Array.isArray(folders)) {
    return NextResponse.json({ error: "folders must be an array" }, { status: 400 });
  }

  const cleaned: { platform_slug: string; path: string; variant: string | null }[] = [];
  const invalid: string[] = [];
  for (const f of folders) {
    const slug = typeof f?.platform_slug === "string" ? f.platform_slug : "";
    const p = typeof f?.path === "string" ? f.path.trim() : "";
    if (!p || !platformBySlug(slug)) continue;
    if (!fs.existsSync(p)) invalid.push(p);
    cleaned.push({
      platform_slug: slug,
      path: p,
      variant:
        typeof f?.variant === "string" && f.variant.trim()
          ? f.variant.trim().toLowerCase()
          : null,
    });
  }
  const prevPaths = new Set(getSystemFolders().map((f) => f.path));
  setSystemFolders(cleaned);
  // Re-point the filesystem watcher at the new set of roots (no-op if it's off).
  (await import("@/lib/fsWatcher")).restartWatcher();
  const added = cleaned.filter((f) => !prevPaths.has(f.path));
  if (added.length) {
    logEvent({
      category: "scan",
      action: "scan.folder_added",
      summary:
        added.length === 1
          ? `New ROM folder mapped: ${platformBySlug(added[0].platform_slug)?.name ?? added[0].platform_slug} → ${added[0].path}`
          : `${added.length} new ROM folders mapped`,
      detail: { added: added.map((f) => ({ slug: f.platform_slug, path: f.path, variant: f.variant })) },
      actor: user,
    });
  }
  return NextResponse.json({ ok: true, folders: getSystemFolders(), invalid });
}

/** Update the hidden-systems list: PATCH { hidden: string[] } */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const { hidden } = await req.json().catch(() => ({}));
  if (!Array.isArray(hidden) || hidden.some((s) => typeof s !== "string" || !platformBySlug(s))) {
    return NextResponse.json({ error: "hidden must be an array of system slugs" }, { status: 400 });
  }
  setHiddenSystems(hidden);
  logEvent({
    category: "settings",
    action: "settings.changed",
    summary: `Updated hidden systems (${hidden.length} hidden)`,
    detail: { hidden },
    actor: user,
  });
  return NextResponse.json({ ok: true, hidden: [...getHiddenSystems()] });
}
