import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { searchUsers, friendshipState } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Friend finder: users matching ?q=, each tagged with the caller's current
 *  relationship to them so the UI can show Add / Requested / Accept / Friends. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const results = searchUsers(q, user.id, 12).map((u) => ({
    ...u,
    state: friendshipState(user.id, u.id),
  }));
  return NextResponse.json({ results });
}
