import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getNewsFeeds, setNewsFeeds, isExternalNewsEnabled, setSetting, NewsFeed } from "@/lib/db";
import { getFeedStatuses, refreshFeeds } from "@/lib/news/external";

// External news feeds: read config + per-feed health (GET), save the feed list +
// on/off toggle (PUT), or force a refresh now (POST).

export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json({
    feeds: getNewsFeeds(),
    external: isExternalNewsEnabled(),
    statuses: getFeedStatuses(),
  });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (Array.isArray(body.feeds)) {
    const feeds: NewsFeed[] = body.feeds
      .filter((f: unknown): f is { url: string; label?: string } => {
        return !!f && typeof (f as { url?: unknown }).url === "string" && (f as { url: string }).url.trim() !== "";
      })
      .map((f: { url: string; label?: string }) => ({
        url: f.url.trim(),
        label: (f.label ?? "").trim() || f.url.trim(),
      }));
    setNewsFeeds(feeds);
  }
  if (typeof body.external === "boolean") {
    setSetting("news_external", body.external ? "on" : "off");
  }
  // pick up new feeds / toggle immediately
  if (isExternalNewsEnabled()) void refreshFeeds().catch(() => {});
  return NextResponse.json({ ok: true, feeds: getNewsFeeds(), external: isExternalNewsEnabled() });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  await refreshFeeds();
  return NextResponse.json({ ok: true, statuses: getFeedStatuses() });
}
