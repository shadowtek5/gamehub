import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { imageExt } from "@/lib/media";
import { getDataDir } from "../../../../../lib/dataDir";

// User-captured in-game screenshots for a game (Steam-style). Files live at
// data/screenshots/<user>/<rom>/<id>.<ext>; each user keeps up to MAX per game.
const MAX_SHOTS_PER_GAME = 100;

function shotsDir(userId: number, romId: number): string {
  return path.join(getDataDir(), "screenshots", String(userId), String(romId));
}

/** List the current user's screenshots for a game (newest first). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const shots = getDb()
    .prepare(
      `SELECT id, width, height, size_bytes, created_at FROM screenshots
       WHERE user_id = ? AND rom_id = ? ORDER BY created_at DESC, id DESC`
    )
    .all(user.id, Number(id));
  return NextResponse.json({ screenshots: shots });
}

/** Store a new screenshot: multipart form with "shot" (PNG/WebP) + optional
 *  width/height. Returns the created row's id. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const romId = Number(id);

  const form = await req.formData().catch(() => null);
  const shot = form?.get("shot");
  if (!(shot instanceof Blob) || shot.size === 0) {
    return NextResponse.json({ error: "shot file required" }, { status: 400 });
  }
  const width = Number(form?.get("width")) || null;
  const height = Number(form?.get("height")) || null;

  const db = getDb();
  const info = db
    .prepare(
      "INSERT INTO screenshots (user_id, rom_id, width, height, size_bytes) VALUES (?, ?, ?, ?, ?)"
    )
    .run(user.id, romId, width, height, shot.size);
  const shotId = Number(info.lastInsertRowid);

  const bytes = Buffer.from(await shot.arrayBuffer());
  const ext = imageExt(bytes);
  const dir = shotsDir(user.id, romId);
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${shotId}.${ext}`);
  await fs.promises.writeFile(file, bytes);
  const dataDir = getDataDir();
  db.prepare("UPDATE screenshots SET image_path = ? WHERE id = ?").run(
    path.relative(dataDir, file),
    shotId
  );

  // Prune the oldest beyond the cap (files + rows) so a user can't fill the disk.
  const extra = db
    .prepare(
      `SELECT id, image_path FROM screenshots WHERE user_id = ? AND rom_id = ?
       ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?`
    )
    .all(user.id, romId, MAX_SHOTS_PER_GAME) as { id: number; image_path: string | null }[];
  for (const row of extra) {
    if (row.image_path) {
      try {
        await fs.promises.rm(path.join(dataDir, row.image_path), { force: true });
      } catch {}
    }
    db.prepare("DELETE FROM screenshots WHERE id = ?").run(row.id);
  }

  return NextResponse.json({ ok: true, id: shotId });
}
