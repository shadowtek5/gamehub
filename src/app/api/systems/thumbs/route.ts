import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { refreshDriftedThumbs } from "@/lib/systemThumb";

/** Manually refresh system collage images (card + hero) whose content
 *  fingerprint has drifted. Runs in the background; returns immediately. */
export async function POST() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  void refreshDriftedThumbs().catch(() => {});
  return NextResponse.json({ ok: true, started: true });
}
