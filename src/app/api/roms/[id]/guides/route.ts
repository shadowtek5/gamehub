import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listGuides, createGuide, getGuide } from "@/lib/db";

// Community guides for a game. GET lists them; POST { title, body } creates one.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json({ guides: listGuides(Number(id)) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!title || !text) {
    return NextResponse.json({ error: "title and body required" }, { status: 400 });
  }
  const guideId = createGuide(Number(id), user.id, title, text);
  return NextResponse.json({ ok: true, guide: getGuide(guideId), guides: listGuides(Number(id)) });
}
