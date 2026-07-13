import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { imageExt } from "@/lib/media";

const MAX_STATES_PER_GAME = 12;

function statesDir(userId: number, romId: number): string {
  return path.join(process.cwd(), "data", "saves", String(userId), String(romId));
}

/** List the current user's save states for a game (newest first) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const states = getDb()
    .prepare(
      `SELECT id, size_bytes, has_screenshot, created_at, label FROM save_states
       WHERE user_id = ? AND rom_id = ? ORDER BY created_at DESC, id DESC`
    )
    .all(user.id, Number(id));
  return NextResponse.json({ states });
}

/** Store a new save state: multipart form with "state" (+ optional "screenshot") */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const romId = Number(id);

  const form = await req.formData().catch(() => null);
  const state = form?.get("state");
  if (!(state instanceof Blob) || state.size === 0) {
    return NextResponse.json({ error: "state file required" }, { status: 400 });
  }
  const screenshot = form?.get("screenshot");
  const hasShot = screenshot instanceof Blob && screenshot.size > 0;
  const label = String(form?.get("label") ?? "").trim().slice(0, 64) || null;

  const db = getDb();
  const info = db
    .prepare(
      "INSERT INTO save_states (user_id, rom_id, size_bytes, has_screenshot, label) VALUES (?, ?, ?, ?, ?)"
    )
    .run(user.id, romId, state.size, hasShot ? 1 : 0, label);
  const stateId = Number(info.lastInsertRowid);

  const dir = statesDir(user.id, romId);
  await fs.promises.mkdir(dir, { recursive: true });
  const dataDir = path.join(process.cwd(), "data");
  const stateFile = path.join(dir, `${stateId}.state`);
  await fs.promises.writeFile(stateFile, Buffer.from(await state.arrayBuffer()));

  // Name the screenshot by its actual format (e.g. WebP or PNG from the game
  // player) so the file + DB path have the right extension.
  let shotPath: string | null = null;
  if (hasShot) {
    const bytes = Buffer.from(await (screenshot as Blob).arrayBuffer());
    const ext = imageExt(bytes);
    const shotFile = path.join(dir, `${stateId}.${ext}`);
    await fs.promises.writeFile(shotFile, bytes);
    shotPath = path.relative(dataDir, shotFile);
  }
  db.prepare("UPDATE save_states SET state_path = ?, screenshot_path = ? WHERE id = ?").run(
    path.relative(dataDir, stateFile),
    shotPath,
    stateId
  );

  // Keep only the newest N states per game
  const old = db
    .prepare(
      `SELECT id, screenshot_path FROM save_states WHERE user_id = ? AND rom_id = ?
       ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?`
    )
    .all(user.id, romId, MAX_STATES_PER_GAME) as { id: number; screenshot_path: string | null }[];
  for (const row of old) {
    db.prepare("DELETE FROM save_states WHERE id = ?").run(row.id);
    const files = [path.join(dir, `${row.id}.state`)];
    if (row.screenshot_path) files.push(path.join(dataDir, row.screenshot_path));
    for (const ext of ["png", "webp", "jpg"]) files.push(path.join(dir, `${row.id}.${ext}`));
    for (const f of files) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  }

  return NextResponse.json({ ok: true, id: stateId });
}
