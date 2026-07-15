import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getBoxartLocalizeStatus, cancelBoxartLocalize } from "@/lib/boxartLocalize";
import { enqueueLocalize, localizePendingOrRunning, cancelQueuedKind } from "@/lib/jobQueue";

/** Parse an optional `systems` string[] from the request body. */
async function bodySystems(req: NextRequest): Promise<string[] | undefined> {
  const body = await req.json().catch(() => ({}));
  return Array.isArray(body?.systems)
    ? body.systems.filter((s: unknown) => typeof s === "string")
    : undefined;
}

export const dynamic = "force-dynamic";

/** Progress of the box-art optimize job. */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json(getBoxartLocalizeStatus());
}

/** Queue a whole-library box-art optimize — it runs through the downloads queue,
 *  serialized with scans/scrapes, and shows on the downloads page. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (localizePendingOrRunning()) {
    return NextResponse.json({ started: false, queued: false, status: getBoxartLocalizeStatus() });
  }
  const res = enqueueLocalize(await bodySystems(req));
  return NextResponse.json({ started: res.started, queued: !res.started, position: res.position, status: getBoxartLocalizeStatus() });
}

/** Cancel a running or queued box-art optimize. */
export async function DELETE() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  cancelQueuedKind("localize");
  cancelBoxartLocalize();
  return NextResponse.json({ ok: true });
}
