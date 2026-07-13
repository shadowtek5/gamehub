import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteAnnouncement, listAnnouncements } from "@/lib/db";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await ctx.params;
  const num = Number(id);
  if (!Number.isFinite(num)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  deleteAnnouncement(num);
  return NextResponse.json({ ok: true, announcements: listAnnouncements(false) });
}
