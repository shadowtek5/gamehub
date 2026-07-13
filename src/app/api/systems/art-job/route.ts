import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getSystemArtJobStatus,
  startSystemArtJob,
  cancelSystemArtJob,
} from "@/lib/systemArtJob";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json(getSystemArtJobStatus());
}

/** Start a force re-scrape of every in-library system's art. */
export async function POST() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!startSystemArtJob()) {
    return NextResponse.json(
      { error: "A system-art re-scrape is already running", ...getSystemArtJobStatus() },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, ...getSystemArtJobStatus() });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  cancelSystemArtJob();
  return NextResponse.json({ ok: true, ...getSystemArtJobStatus() });
}
