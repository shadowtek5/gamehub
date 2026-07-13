import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { searchAudioPacks } from "@/lib/audiopacks";

export const dynamic = "force-dynamic";

/** Browse deckthemes audio packs (admin). filter: Audio | Music | All */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1) || 1);
  const filter = req.nextUrl.searchParams.get("filter") ?? "";
  const order = req.nextUrl.searchParams.get("order") ?? "Most Downloaded";
  try {
    return NextResponse.json(await searchAudioPacks(q, page, filter, order));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Search failed" },
      { status: 502 }
    );
  }
}
