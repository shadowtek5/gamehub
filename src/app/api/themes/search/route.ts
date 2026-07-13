import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { searchDeckThemes, deckThemesFilters } from "@/lib/themes";

export const dynamic = "force-dynamic";

/** Browse deckthemes.com CSS themes (admin) — proxied server-side.
 *  ?filter=<target> scopes to one store target (System-Wide, Tweak,
 *  Snippet, …); ?meta=filters returns the available targets. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  if (req.nextUrl.searchParams.get("meta") === "filters") {
    try {
      return NextResponse.json({ filters: await deckThemesFilters() });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "deckthemes.com unreachable" },
        { status: 502 }
      );
    }
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const order = req.nextUrl.searchParams.get("order") ?? "Most Downloaded";
  const filter = req.nextUrl.searchParams.get("filter") ?? "";
  try {
    return NextResponse.json(await searchDeckThemes(q, page, order, filter));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "deckthemes.com unreachable" },
      { status: 502 }
    );
  }
}
