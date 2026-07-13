import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { searchBackgrounds } from "@/lib/profile";

// Searchable, paginated hero-art source for the profile-background picker.
// GET /api/profile/backgrounds?q=<name>&offset=<n>
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);
  const { items, hasMore } = searchBackgrounds(user.id, q, offset, 30);
  return NextResponse.json({ items, hasMore });
}
