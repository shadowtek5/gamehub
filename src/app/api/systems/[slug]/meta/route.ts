import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { scrapeSystemMeta } from "@/lib/systemMeta";
import { getSystemMeta } from "@/lib/db";

/** Scrape this console's metadata (manufacturer, type, years, media format,
 *  JP/alternate names) from ScreenScraper into the systems table. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const { slug } = await params;
  const stored = await scrapeSystemMeta(slug);
  return NextResponse.json({ ok: true, stored, meta: getSystemMeta(slug) });
}
