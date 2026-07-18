import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { imageContentType } from "@/lib/media";
import { getDataDir } from "../../../../lib/dataDir";

interface ShotRow {
  id: number;
  user_id: number;
  rom_id: number;
  image_path: string | null;
}

function shotRow(id: number): ShotRow | undefined {
  return getDb()
    .prepare("SELECT id, user_id, rom_id, image_path FROM screenshots WHERE id = ?")
    .get(id) as ShotRow | undefined;
}

function fileFor(row: ShotRow): string | null {
  if (!row.image_path) return null;
  return path.join(getDataDir(), row.image_path);
}

/** Serve a screenshot image (owner or admin). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = shotRow(Number(id));
  if (!row || (row.user_id !== user.id && !user.isAdmin)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const file = fileFor(row);
  if (!file || !fs.existsSync(file)) {
    return NextResponse.json({ error: "Missing file" }, { status: 404 });
  }
  const buf = await fs.promises.readFile(file);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": imageContentType(buf),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

/** Delete a screenshot (owner or admin). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = shotRow(Number(id));
  if (!row || (row.user_id !== user.id && !user.isAdmin)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const file = fileFor(row);
  if (file) {
    try {
      await fs.promises.rm(file, { force: true });
    } catch {}
  }
  getDb().prepare("DELETE FROM screenshots WHERE id = ?").run(row.id);
  return NextResponse.json({ ok: true });
}
