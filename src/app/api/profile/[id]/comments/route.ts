import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

/** Post a comment on a user's profile */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const profileId = Number(id);
  const target = getDb().prepare("SELECT id FROM users WHERE id = ?").get(profileId);
  if (!target) return NextResponse.json({ error: "No such user" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.body ?? "").trim().slice(0, 1000);
  if (!text) return NextResponse.json({ error: "Comment is empty" }, { status: 400 });

  const info = getDb()
    .prepare("INSERT INTO profile_comments (profile_user_id, author_id, body) VALUES (?, ?, ?)")
    .run(profileId, user.id, text);
  return NextResponse.json({ ok: true, id: Number(info.lastInsertRowid) });
}

/** Delete a comment — its author, the profile owner, or an admin */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const profileId = Number(id);
  const commentId = Number(req.nextUrl.searchParams.get("commentId"));
  const row = getDb()
    .prepare("SELECT author_id FROM profile_comments WHERE id = ? AND profile_user_id = ?")
    .get(commentId, profileId) as { author_id: number } | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.author_id !== user.id && profileId !== user.id && !user.isAdmin) {
    return NextResponse.json({ error: "Not your comment" }, { status: 403 });
  }
  getDb().prepare("DELETE FROM profile_comments WHERE id = ?").run(commentId);
  return NextResponse.json({ ok: true });
}
