import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getHashJobStatus, startHashJob, cancelHashJob } from "@/lib/hashJob";

export async function GET() {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  return NextResponse.json(getHashJobStatus());
}

/** Start hashing: { systems?: string[], rehashArchives?: boolean }.
 *  rehashArchives re-hashes .zip/.7z ROMs that already have (legacy outer-file)
 *  hashes so they pick up the inner-ROM hash that matches No-Intro/Redump. */
export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  const body = await req.json().catch(() => ({}));
  const systems = Array.isArray(body.systems)
    ? body.systems.filter((s: unknown) => typeof s === "string")
    : undefined;
  if (!startHashJob(systems, { rehashArchives: !!body.rehashArchives })) {
    return NextResponse.json(
      { error: "A hash job is already running", ...getHashJobStatus() },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, ...getHashJobStatus() });
}

export async function DELETE() {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  cancelHashJob();
  return NextResponse.json({ ok: true, ...getHashJobStatus() });
}
