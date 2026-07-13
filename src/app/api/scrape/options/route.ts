import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getScraperOptions, setScraperOptions } from "@/lib/providers/config";
import { logEvent } from "@/lib/eventLog";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json({ options: getScraperOptions() });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const current = getScraperOptions();
  setScraperOptions({
    priority: body.priority ?? current.priority,
    itemProviders: body.itemProviders ?? current.itemProviders,
    items: { ...current.items, ...(body.items ?? {}) },
    hashMatching:
      typeof body.hashMatching === "boolean" ? body.hashMatching : current.hashMatching,
    boxStyle: body.boxStyle === "3d" || body.boxStyle === "2d" ? body.boxStyle : current.boxStyle,
    maxConcurrency:
      body.maxConcurrency === undefined ? current.maxConcurrency : body.maxConcurrency,
  });
  logEvent({
    category: "settings",
    action: "settings.changed",
    summary: "Updated scraper options",
    actor: user,
  });
  return NextResponse.json({ ok: true, options: getScraperOptions() });
}
