import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, ensureUserRom } from "@/lib/db";
import { logActivity } from "@/lib/activity";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const romId = Number(id);
  const body = await req.json().catch(() => ({}));
  ensureUserRom(user.id, romId);
  const db = getDb();

  let next: number;
  if (body.toggle === true) {
    const row = db
      .prepare("SELECT favorite FROM user_roms WHERE user_id = ? AND rom_id = ?")
      .get(user.id, romId) as { favorite: number } | undefined;
    next = row?.favorite === 1 ? 0 : 1;
  } else {
    next = body.favorite ? 1 : 0;
  }
  db.prepare("UPDATE user_roms SET favorite = ? WHERE user_id = ? AND rom_id = ?").run(
    next,
    user.id,
    romId
  );
  logActivity({
    userId: user.id,
    romId,
    type: "favorite",
    summary: next === 1 ? "Added to Favorites" : "Removed from Favorites",
  });
  return NextResponse.json({ ok: true, favorite: next === 1 });
}
