import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getScanJobStatus, cancelScanJob } from "@/lib/scanJob";
import { enqueueScan, cancelQueuedKind } from "@/lib/jobQueue";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json(getScanJobStatus());
}

/** Queue a background scan: { systems?: string[] } (null/omitted = all configured).
 *  Serialized behind any running/queued job — see jobQueue. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const systems: string[] | null = Array.isArray(body.systems)
    ? body.systems.filter((s: unknown) => typeof s === "string")
    : null;

  const { started, position } = enqueueScan(systems, { id: user.id, name: user.username });
  return NextResponse.json({ ok: true, queued: !started, position, ...getScanJobStatus() });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  // Cancel the running scan (if any) AND drop any scans waiting in the queue.
  cancelScanJob();
  cancelQueuedKind("scan");
  return NextResponse.json({ ok: true, ...getScanJobStatus() });
}
