import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listSystemGamesWithCovers } from "@/lib/db";

export const dynamic = "force-dynamic";

/** A system's games that have cover art (for the custom-collage picker). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const { slug } = await params;
  return NextResponse.json({ games: listSystemGamesWithCovers(slug) });
}
