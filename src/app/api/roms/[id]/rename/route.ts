import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb, RomRow } from "@/lib/db";
import { parseLanguages } from "@/lib/language";

/** Rename the ROM file on disk (admin): { filename } */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await params;
  const rom = getDb().prepare("SELECT * FROM roms WHERE id = ?").get(Number(id)) as
    | RomRow
    | undefined;
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const filename = path.basename(String(body.filename ?? "").trim());
  if (!filename || filename !== String(body.filename ?? "").trim()) {
    return NextResponse.json({ error: "A plain file name is required" }, { status: 400 });
  }
  const oldExt = path.extname(rom.filename).toLowerCase();
  if (path.extname(filename).toLowerCase() !== oldExt) {
    return NextResponse.json(
      { error: `The extension must stay ${oldExt}` },
      { status: 400 }
    );
  }
  const dir = path.dirname(rom.path);
  const newPath = path.join(dir, filename);
  if (fs.existsSync(newPath)) {
    return NextResponse.json({ error: "A file with that name already exists" }, { status: 409 });
  }

  try {
    await fs.promises.rename(rom.path, newPath);
  } catch (e) {
    return NextResponse.json(
      { error: `Rename failed: ${e instanceof Error ? e.message : e}` },
      { status: 500 }
    );
  }
  getDb()
    .prepare("UPDATE roms SET path = ?, filename = ?, language = ? WHERE id = ?")
    .run(newPath, filename, parseLanguages(filename, rom.region), rom.id);
  return NextResponse.json({ ok: true, filename, path: newPath });
}
