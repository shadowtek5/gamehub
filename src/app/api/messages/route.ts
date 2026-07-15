import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listConversations, totalUnreadMessages } from "@/lib/db";

// Inbox: every friend with a last-message preview + unread count, plus the
// caller's total unread (for a badge). Polled by the messages UI / badges.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    conversations: listConversations(user.id),
    unread: totalUnreadMessages(user.id),
  });
}
