import { NextRequest, NextResponse } from "next/server";
import { renderBadgeArt } from "@/lib/badgeArt";

// Decorative, deterministic SVG artwork for achievement badges, in the What's New
// banner style (see lib/badgeArt.ts). Derived entirely from query params — no data
// access — so it needs no auth and is safe to cache aggressively.

export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const svg = renderBadgeArt({
    variant: sp.get("v") ?? "default",
    color: sp.get("c") ?? undefined,
    name: sp.get("n") ?? undefined,
  });
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
