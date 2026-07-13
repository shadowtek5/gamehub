import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { logActivity } from "@/lib/activity";

/** Post a "say something" status to a game's activity feed. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const romId = Number(id);
  if (!getDb().prepare("SELECT id FROM roms WHERE id = ?").get(romId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
  if (!text) return NextResponse.json({ error: "Say something first" }, { status: 400 });

  const activityId = logActivity({ userId: user.id, romId, type: "comment", summary: text });
  return NextResponse.json({ ok: true, id: activityId });
}
