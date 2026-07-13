import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { searchLibraryBrowse } from "@/lib/db";

/** Paged, filtered library browse — backs the /library infinite grid */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const result = searchLibraryBrowse(user.id, {
    q: p.get("q")?.trim() || undefined,
    tab: p.get("tab") || undefined,
    platform: p.get("platform") || undefined,
    variant: p.get("variant") || undefined,
    genre: p.get("genre") || undefined,
    modes: p.get("modes") || undefined,
    language: p.get("language") || undefined,
    missing: p.get("missing") || undefined,
    virtualDim: p.get("virtualDim") || undefined,
    virtualValue: p.get("virtualValue") || undefined,
    collection: p.get("collection") || undefined,
    sort: p.get("sort") || undefined,
    offset: Number(p.get("offset")) || 0,
    limit: Number(p.get("limit")) || 150,
  });
  return NextResponse.json(result);
}
