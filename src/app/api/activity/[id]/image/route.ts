import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { Readable } from "stream";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { activityImagePath } from "@/lib/activity";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Serve an activity entry's snapshot image (owner only). */
export async function GET(
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

  if (!row || !row.image_ext) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const filePath = activityImagePath(row.rom_id, Number(id), row.image_ext);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const headers = new Headers({
    "Content-Type": TYPES[row.image_ext] ?? "application/octet-stream",
    "Content-Length": String(stat.size),
    "Cache-Control": "private, max-age=31536000, immutable",
  });
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, { status: 200, headers });
}
