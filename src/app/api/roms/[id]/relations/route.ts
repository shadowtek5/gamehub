import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { addRomRelation, removeRomRelation, listRomRelations } from "@/lib/db";

// User-curated related games for a game, on top of the IGDB-derived ones.
//   GET    → current custom relations (for the manager list)
//   POST   { relatedRomId, kind? }  → add a link
//   DELETE ?relId=N                 → remove a link
// Editing is gated to editors/admins; anyone signed in can read.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json({ relations: listRomRelations(Number(id)) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { id } = await params;
  const romId = Number(id);
  const body = await req.json().catch(() => ({}));
  const relatedRomId = Number(body?.relatedRomId);
  const kind = typeof body?.kind === "string" && body.kind.trim() ? body.kind.trim() : "Related";
  if (!Number.isInteger(relatedRomId) || relatedRomId <= 0) {
    return NextResponse.json({ error: "relatedRomId required" }, { status: 400 });
  }
  if (relatedRomId === romId) {
    return NextResponse.json({ error: "A game can't relate to itself" }, { status: 400 });
  }
  const added = addRomRelation(romId, relatedRomId, kind, user.id);
  return NextResponse.json({ ok: true, added, relations: listRomRelations(romId) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { id } = await params;
  const relId = Number(req.nextUrl.searchParams.get("relId"));
  if (!Number.isInteger(relId) || relId <= 0) {
    return NextResponse.json({ error: "relId required" }, { status: 400 });
  }
  removeRomRelation(relId);
  return NextResponse.json({ ok: true, relations: listRomRelations(Number(id)) });
}
