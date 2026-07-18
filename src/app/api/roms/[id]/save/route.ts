import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { imageExt, imageContentType } from "@/lib/media";
import { getDataDir } from "../../../../../lib/dataDir";

// Battery save (.srm): one live slot per user per game — loaded into the
// emulator on start, synced back on exit and periodically while playing.

function saveFile(userId: number, romId: number): string {
  return path.join(getDataDir(), "battery", String(userId), `${romId}.srm`);
}
function shotFile(userId: number, romId: number, ext: string): string {
  return path.join(getDataDir(), "battery", String(userId), `${romId}.${ext}`);
}

/** Download your battery save (?type=screenshot for its thumbnail). 404 if none. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const wantShot = req.nextUrl.searchParams.get("type") === "screenshot";
  const row = getDb()
    .prepare("SELECT save_path, screenshot_path FROM battery_saves WHERE user_id = ? AND rom_id = ?")
    .get(user.id, Number(id)) as { save_path: string | null; screenshot_path: string | null } | undefined;
  const stored = wantShot ? row?.screenshot_path : row?.save_path;
  const file = stored
    ? path.join(getDataDir(), stored)
    : wantShot
      ? shotFile(user.id, Number(id), "png")
      : saveFile(user.id, Number(id));
  if (!fs.existsSync(file)) return NextResponse.json({ error: "No save" }, { status: 404 });
  const buf = await fs.promises.readFile(file);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": wantShot ? imageContentType(buf) : "application/octet-stream",
      ...(wantShot ? {} : { "Content-Disposition": `attachment; filename="${id}.srm"` }),
      "Content-Length": String(buf.length),
    },
  });
}

/** Upload/replace your battery save (raw body or multipart "save") */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const romId = Number(id);
  const rom = getDb().prepare("SELECT id FROM roms WHERE id = ?").get(romId);
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let data: Buffer;
  let shot: Buffer | null = null;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("save");
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: "save file required" }, { status: 400 });
    }
    data = Buffer.from(await file.arrayBuffer());
    const screenshot = form?.get("screenshot");
    if (screenshot instanceof Blob && screenshot.size > 0) {
      shot = Buffer.from(await screenshot.arrayBuffer());
    }
  } else {
    data = Buffer.from(await req.arrayBuffer());
  }
  if (data.length === 0) return NextResponse.json({ error: "Empty save" }, { status: 400 });
  if (data.length > 32 * 1024 * 1024) {
    return NextResponse.json({ error: "Save too large (32MB max)" }, { status: 400 });
  }

  const file = saveFile(user.id, romId);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, data);
  const shotPath = shot ? shotFile(user.id, romId, imageExt(shot)) : null;
  if (shot && shotPath) await fs.promises.writeFile(shotPath, shot);
  const dataDir = getDataDir();
  getDb()
    .prepare(
      `INSERT INTO battery_saves (user_id, rom_id, size_bytes, save_path, screenshot_path, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, rom_id) DO UPDATE SET
         size_bytes = excluded.size_bytes, save_path = excluded.save_path,
         screenshot_path = COALESCE(excluded.screenshot_path, battery_saves.screenshot_path),
         updated_at = datetime('now')`
    )
    .run(
      user.id,
      romId,
      data.length,
      path.relative(dataDir, file),
      shotPath ? path.relative(dataDir, shotPath) : null
    );
  return NextResponse.json({ ok: true, size: data.length });
}

/** Delete your battery save */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const romId = Number(id);
  getDb()
    .prepare("DELETE FROM battery_saves WHERE user_id = ? AND rom_id = ?")
    .run(user.id, romId);
  try {
    fs.rmSync(saveFile(user.id, romId), { force: true });
    for (const ext of ["png", "webp", "jpg"]) {
      fs.rmSync(shotFile(user.id, romId, ext), { force: true });
    }
  } catch {}
  return NextResponse.json({ ok: true });
}
