import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getDb,
  areFriends,
  getThread,
  markThreadRead,
  sendMessage,
  presenceOf,
} from "@/lib/db";

// A DM thread with one friend. GET returns the messages (and marks them read);
// POST { body } sends one. Both require an accepted friendship.

function otherBrief(otherId: number) {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(real_name), ''), username) AS name,
              avatar_url, status, last_seen
         FROM users WHERE id = ?`
    )
    .get(otherId) as
    | { name: string; avatar_url: string | null; status: string | null; last_seen: string | null }
    | undefined;
  return row
    ? { id: otherId, name: row.name, avatar_url: row.avatar_url, presence: presenceOf(row.status, row.last_seen) }
    : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ otherId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const otherId = Number((await params).otherId);
  if (!areFriends(user.id, otherId)) {
    return NextResponse.json({ error: "Not friends" }, { status: 403 });
  }
  markThreadRead(user.id, otherId);
  return NextResponse.json({ messages: getThread(user.id, otherId), other: otherBrief(otherId) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ otherId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const otherId = Number((await params).otherId);
  const body = await req.json().catch(() => ({}));
  const text = typeof body?.body === "string" ? body.body : "";
  const msg = sendMessage(user.id, otherId, text);
  if (!msg) return NextResponse.json({ error: "Can't send (not friends or empty)" }, { status: 403 });
  return NextResponse.json({ ok: true, message: msg });
}
