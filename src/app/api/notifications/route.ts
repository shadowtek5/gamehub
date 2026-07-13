import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { touchLastSeen } from "@/lib/db";
import { getNotifications, markRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** The signed-in user's notification feed + unread count for the header bell. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // The header polls this every 60s on every page → use it as the presence
  // heartbeat that powers "who's online" in the friends list.
  touchLastSeen(user.id);
  const notifications = await getNotifications(user);
  const unread = notifications.filter((n) => !n.read).length;
  return NextResponse.json({ notifications, unread });
}

/** Mark items read. Body: { all: true } marks the whole current feed, or
 *  { keys: string[] } dismisses specific items. Read-state is pruned to the
 *  live feed so it can't accumulate stale keys. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const current = await getNotifications(user);
  const validKeys = current.map((n) => n.key);
  const keys =
    body?.all === true
      ? validKeys
      : Array.isArray(body?.keys)
        ? body.keys.filter((k: unknown): k is string => typeof k === "string")
        : [];

  markRead(user.id, keys, validKeys);
  return NextResponse.json({ ok: true });
}
