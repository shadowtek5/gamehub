import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listAnnouncements, createAnnouncement } from "@/lib/db";

// Admin CRUD for home-page announcements. Reads return every announcement
// (published or not) so the settings editor can manage drafts; the home feed
// uses listAnnouncements(true) directly.

export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json({ announcements: listAnnouncements(false) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const id = createAnnouncement(title, text, user.id);
  return NextResponse.json({ ok: true, id, announcements: listAnnouncements(false) });
}
