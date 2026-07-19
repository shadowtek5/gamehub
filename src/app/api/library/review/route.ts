import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listUnidentified, listHashDupGroups } from "@/lib/db";
import { findTitleDuplicates } from "@/lib/audit";
import { platformBySlug } from "@/lib/platforms";

/** Data for the library review/cleanup page.
 *  ?tab = unidentified | hash | title  (default unidentified)
 *  ?offset, ?limit  (pagination for the active tab)
 *  ?system = slug   (filter the unidentified tab)
 *  Always returns `counts` for the three tab labels. Admin only. */
export async function GET(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  const user = g;

  const sp = req.nextUrl.searchParams;
  const tab = sp.get("tab") ?? "unidentified";
  const offset = Math.max(0, Number(sp.get("offset")) || 0);
  const limit = Math.min(120, Math.max(1, Number(sp.get("limit")) || 60));
  const system = sp.get("system") || undefined;

  // Title 1G1R groups are computed once (a full-library grouping); reused for
  // both the count label and — when it's the active tab — the paged payload.
  const titleGroups = findTitleDuplicates();

  const counts = {
    unidentified: listUnidentified(user.id, { limit: 0 }).total,
    hash: listHashDupGroups({ limit: 0 }).total,
    title: titleGroups.length,
  };

  if (tab === "hash") {
    const { groups, total } = listHashDupGroups({ offset, limit: Math.min(limit, 40) });
    return NextResponse.json({ tab, counts, groups, total });
  }

  if (tab === "title") {
    const page = titleGroups.slice(offset, offset + Math.min(limit, 40)).map((grp) => ({
      ...grp,
      platform_name: platformBySlug(grp.slug)?.name ?? grp.slug,
    }));
    return NextResponse.json({ tab, counts, groups: page, total: titleGroups.length });
  }

  const { rows, total } = listUnidentified(user.id, { offset, limit, platform: system });
  return NextResponse.json({ tab, counts, rows, total });
}
