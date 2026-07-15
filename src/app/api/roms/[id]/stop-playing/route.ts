import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { clearPlaying } from "@/lib/db";

// Clears the caller's live "now playing" status when they leave a game. Sent by
// the emulator on exit / page-unload (navigator.sendBeacon), so it must be cheap
// and tolerate a body-less beacon. Scoped to this rom so a late beacon from a
// previous session can't wipe a newer one.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  clearPlaying(user.id, Number(id));
  return NextResponse.json({ ok: true });
}
