import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { findDuplicates } from "@/lib/audit";
import { platformBySlug } from "@/lib/platforms";

/** Byte-identical ROM groups (same MD5). Optional ?systems=slug,slug. */
export async function GET(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;

  const q = req.nextUrl.searchParams.get("systems");
  const systems = q ? q.split(",").filter(Boolean) : undefined;
  const groups = findDuplicates(systems).map((g) => ({
    ...g,
    members: g.members.map((m) => ({ ...m, platform_name: platformBySlug(m.platform_slug)?.name ?? m.platform_slug })),
  }));
  const totalWasted = groups.reduce((sum, g) => sum + g.wastedBytes, 0);
  return NextResponse.json({ groups, totalWasted });
}
