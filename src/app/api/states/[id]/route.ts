import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { imageContentType } from "@/lib/media";
import { getDataDir } from "../../../../lib/dataDir";

interface StateRow {
  id: number;
  user_id: number;
  rom_id: number;
  has_screenshot: number;
  state_path: string | null;
  screenshot_path: string | null;
}

/** Resolve a state's file from the DB-stored path, falling back to the derived
 *  location for legacy rows written before paths were tracked. */
function stateFile(row: StateRow, ext: "state" | "png"): string {
  const stored = ext === "png" ? row.screenshot_path : row.state_path;
  if (stored) return path.join(getDataDir(), stored);
  return path.join(getDataDir(), "saves", String(row.user_id), String(row.rom_id), `${row.id}.${ext}`);
}

function ownState(userId: number, stateId: number): StateRow | undefined {
  return getDb()
    .prepare(
      "SELECT id, user_id, rom_id, has_screenshot, state_path, screenshot_path FROM save_states WHERE id = ? AND user_id = ?"
    )
    .get(stateId, userId) as StateRow | undefined;
}

/** Fetch a save state's data (?type=screenshot for the thumbnail) */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = ownState(user.id, Number(id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wantShot = req.nextUrl.searchParams.get("type") === "screenshot";
  const file = stateFile(row, wantShot ? "png" : "state");
  if (!fs.existsSync(file)) return NextResponse.json({ error: "Missing file" }, { status: 404 });

  const buf = await fs.promises.readFile(file);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": wantShot ? imageContentType(buf) : "application/octet-stream",
      "Content-Length": String(buf.length),
      "Cache-Control": "private, max-age=86400",
    },
  });
}

/** Rename a save state: { label } */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = ownState(user.id, Number(id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const label =
    typeof body.label === "string" ? body.label.trim().slice(0, 64) || null : null;
  getDb().prepare("UPDATE save_states SET label = ? WHERE id = ?").run(label, row.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = ownState(user.id, Number(id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  getDb().prepare("DELETE FROM save_states WHERE id = ?").run(row.id);
  for (const ext of ["state", "png"] as const) {
    const f = stateFile(row, ext);
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  }
  return NextResponse.json({ ok: true });
}
