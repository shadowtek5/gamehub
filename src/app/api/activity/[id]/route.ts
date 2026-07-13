import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { activityImagePath } from "@/lib/activity";

/** Delete one of your own activity entries (and its snapshot, if any). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = getDb()
    .prepare("SELECT user_id, rom_id, image_ext FROM activity WHERE id = ?")
    .get(Number(id)) as
    | { user_id: number; rom_id: number | null; image_ext: string | null }
    | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (row.image_ext) {
    fs.promises
      .rm(activityImagePath(row.rom_id, Number(id), row.image_ext), { force: true })
      .catch(() => {});
  }
  getDb().prepare("DELETE FROM activity WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
