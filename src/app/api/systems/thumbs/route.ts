import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getThumbJobStatus, cancelThumbJob } from "@/lib/systemThumb";
import { enqueueThumbs, thumbsPendingOrRunning, cancelQueuedKind } from "@/lib/jobQueue";

export const dynamic = "force-dynamic";

/** Progress of the system-image refresh job. */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json(getThumbJobStatus());
}

/** Queue a refresh of system collage images (card + hero) whose fingerprint has
 *  drifted. Runs through the downloads queue, serialized with other jobs. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (thumbsPendingOrRunning()) {
    return NextResponse.json({ ok: true, started: false, queued: false, ...getThumbJobStatus() });
  }
  const body = await req.json().catch(() => ({}));
  const systems = Array.isArray(body?.systems)
    ? body.systems.filter((s: unknown) => typeof s === "string")
    : undefined;
  const res = enqueueThumbs(systems, body?.force === true);
  return NextResponse.json({ ok: true, started: res.started, queued: !res.started, ...getThumbJobStatus() });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  cancelQueuedKind("thumbs");
  cancelThumbJob();
  return NextResponse.json({ ok: true, ...getThumbJobStatus() });
}
