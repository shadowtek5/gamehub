import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, ensureUserRom } from "@/lib/db";

const VALID = ["none", "backlog", "playing", "beaten", "dropped"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const romId = Number(id);
  const { status } = await req.json().catch(() => ({}));
  if (!VALID.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  ensureUserRom(user.id, romId);
  getDb()
    .prepare("UPDATE user_roms SET play_status = ? WHERE user_id = ? AND rom_id = ?")
    .run(status, user.id, romId);
  return NextResponse.json({ ok: true, status });
}
