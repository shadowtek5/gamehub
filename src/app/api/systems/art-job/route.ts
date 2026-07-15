import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSystemArtJobStatus, cancelSystemArtJob } from "@/lib/systemArtJob";
import { enqueueSystemArt, systemArtPendingOrRunning, cancelQueuedKind } from "@/lib/jobQueue";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json(getSystemArtJobStatus());
}

/** Force re-scrape system art — whole library, or a { systems: string[] } subset. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (systemArtPendingOrRunning()) {
    return NextResponse.json(
      { error: "A system-art re-scrape is already running", ...getSystemArtJobStatus() },
      { status: 409 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const systems = Array.isArray(body?.systems)
    ? body.systems.filter((s: unknown) => typeof s === "string")
    : undefined;
  const res = enqueueSystemArt(systems);
  return NextResponse.json({ ok: true, started: res.started, queued: !res.started, ...getSystemArtJobStatus() });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  cancelQueuedKind("art");
  cancelSystemArtJob();
  return NextResponse.json({ ok: true, ...getSystemArtJobStatus() });
}
