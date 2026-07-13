import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getDb,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendship,
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
} from "@/lib/db";

export const dynamic = "force-dynamic";

/** The signed-in user's friends + pending requests (incoming & outgoing). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    friends: listFriends(user.id),
    incoming: listIncomingRequests(user.id),
    outgoing: listOutgoingRequests(user.id),
  });
}

/** Mutate a friendship. Body: { action: "request"|"accept"|"remove", userId }.
 *  "remove" covers unfriend, cancel-outgoing and decline-incoming (all delete
 *  the row). Every action is symmetric-safe and scoped to the acting user. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const otherId = Number(body?.userId);
  const action = body?.action;

  if (!Number.isInteger(otherId) || otherId <= 0 || otherId === user.id) {
    return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  }
  if (!getDb().prepare("SELECT 1 FROM users WHERE id = ?").get(otherId)) {
    return NextResponse.json({ error: "No such user" }, { status: 404 });
  }

  switch (action) {
    case "request":
      return NextResponse.json({ ok: true, state: sendFriendRequest(user.id, otherId) });
    case "accept":
      acceptFriendRequest(user.id, otherId);
      return NextResponse.json({ ok: true, state: "friends" });
    case "remove":
      removeFriendship(user.id, otherId);
      return NextResponse.json({ ok: true, state: "none" });
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
