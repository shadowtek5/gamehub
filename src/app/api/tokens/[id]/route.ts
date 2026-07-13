import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

/** Revoke one of your own API tokens (admins can revoke anyone's) */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = getDb()
    .prepare("SELECT user_id FROM api_tokens WHERE id = ?")
    .get(Number(id)) as { user_id: number } | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.user_id !== user.id && !user.isAdmin) {
    return NextResponse.json({ error: "Not your token" }, { status: 403 });
  }
  getDb().prepare("DELETE FROM api_tokens WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
