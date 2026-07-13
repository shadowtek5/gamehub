import { NextRequest, NextResponse } from "next/server";
import { renderBanner } from "@/lib/news/banner";

// Decorative, deterministic SVG banners for news cards (see lib/news/banner.ts).
// Derived entirely from query params — no data access — so it needs no auth and
// is safe to cache aggressively.

export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const svg = renderBanner({
    variant: sp.get("v") ?? "default",
    color: sp.get("c") ?? undefined,
    text: sp.get("t") ?? undefined,
    number: sp.get("n") ?? undefined,
    kicker: sp.get("k") ?? undefined,
    bare: sp.get("b") === "1",
  });
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
