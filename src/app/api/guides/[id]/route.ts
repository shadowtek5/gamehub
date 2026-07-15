import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getGuide, updateGuide, deleteGuide, listGuides } from "@/lib/db";

// A single guide: GET the full guide; PATCH edits it; DELETE removes it. Editing
// and deleting are limited to the author or an admin.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const guide = getGuide(Number(id));
  if (!guide) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ guide });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!title || !text) return NextResponse.json({ error: "title and body required" }, { status: 400 });
  const ok = updateGuide(Number(id), user.id, user.isAdmin, title, text);
  if (!ok) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const guide = getGuide(Number(id));
  return NextResponse.json({ ok: true, guide, guides: guide ? listGuides(guide.romId) : [] });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const guide = getGuide(Number(id));
  const ok = deleteGuide(Number(id), user.id, user.isAdmin);
  if (!ok) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ ok: true, guides: guide ? listGuides(guide.romId) : [] });
}
