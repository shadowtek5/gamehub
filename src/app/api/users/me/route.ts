import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getProfileUser, profileName } from "@/lib/profile";

/** The authenticated identity (works with session cookies and API tokens) */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = getProfileUser(user.id);
  return NextResponse.json({
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: row ? profileName(row) : user.username,
    avatarUrl: row?.avatar_url ?? null,
    createdAt: row?.created_at ?? null,
  });
}
