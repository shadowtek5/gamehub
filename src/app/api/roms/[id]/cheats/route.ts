import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getLibraryRom,
  listCheats,
  addCheat,
  setCheatEnabled,
  deleteCheat,
} from "@/lib/db";
import { prebuiltCheats } from "@/lib/cheats/catalog";

// Per-user, per-game cheats. GET returns the user's saved cheats plus the
// prebuilt catalog entries available for this game. POST adds one, PATCH toggles
// enabled, DELETE removes. Codes are applied to the core client-side.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const romId = Number(id);
  const rom = getLibraryRom(user.id, romId);
  const prebuilt = rom ? prebuiltCheats(rom.platform_slug, rom.title) : [];
  return NextResponse.json({ cheats: listCheats(user.id, romId), prebuilt });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name : "";
  const code = typeof body?.code === "string" ? body.code : "";
  if (!code.trim()) return NextResponse.json({ error: "code required" }, { status: 400 });
  const row = addCheat(user.id, Number(id), name, code);
  return NextResponse.json({ ok: true, cheat: row });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await params; // rom id not needed — cheat id is globally unique and owner-scoped
  const body = await req.json().catch(() => ({}));
  const cheatId = Number(body?.id);
  if (!cheatId) return NextResponse.json({ error: "id required" }, { status: 400 });
  setCheatEnabled(user.id, cheatId, !!body?.enabled);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await params;
  const body = await req.json().catch(() => ({}));
  const cheatId = Number(body?.id);
  if (!cheatId) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteCheat(user.id, cheatId);
  return NextResponse.json({ ok: true });
}
