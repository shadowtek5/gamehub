import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { findTitleDuplicates } from "@/lib/audit";
import { platformBySlug } from "@/lib/platforms";

/** Same-game groups (normalized title) held as multiple region/revision/rename
 *  dumps — the 1G1R case. Optional ?systems=slug,slug. */
export async function GET(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;

  const q = req.nextUrl.searchParams.get("systems");
  const systems = q ? q.split(",").filter(Boolean) : undefined;
  const groups = findTitleDuplicates(systems).map((grp) => ({
    ...grp,
    platform_name: platformBySlug(grp.slug)?.name ?? grp.slug,
  }));
  const redundant = groups.reduce(
    (n, grp) => n + (grp.count - 1),
    0
  );
  return NextResponse.json({ groups, redundant });
}
