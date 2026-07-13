import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getScrapeJobStatus, cancelScrapeJob } from "@/lib/providers/scrapeJob";
import { enqueueScrape, cancelQueuedKind } from "@/lib/jobQueue";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json(getScrapeJobStatus());
}

/** Queue a background scrape: { onlyMissing?: boolean, systems?: string[] }.
 *  Serialized behind any running/queued job — targets are resolved when the job
 *  actually starts (so a scan queued ahead of it is reflected). See jobQueue. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const onlyMissing = body.onlyMissing === true;
  const metadataOnly = body.metadataOnly === true;
  const systems: string[] | null = Array.isArray(body.systems)
    ? body.systems.filter((s: unknown) => typeof s === "string")
    : null;

  const { started, position } = enqueueScrape(
    onlyMissing,
    systems?.length ? systems : null,
    user.id,
    metadataOnly
  );
  return NextResponse.json({ ok: true, queued: !started, position, ...getScrapeJobStatus() });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  cancelScrapeJob();
  cancelQueuedKind("scrape");
  return NextResponse.json({ ok: true, ...getScrapeJobStatus() });
}
