import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { datSetReports, type RegionMode } from "@/lib/audit";
import { datConfigured } from "@/lib/providers/datdb";
import { platformBySlug } from "@/lib/platforms";

const REGION_MODES: RegionMode[] = ["all", "USA", "Europe", "Japan"];

/** Missing-from-set report per system. Optional ?systems=slug,slug (default: all
 *  systems with DAT coverage) and ?region=all|USA|Europe|Japan (default USA: a
 *  North-America preference that falls back per system where NA has no titles). */
export async function GET(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  if (!datConfigured()) return NextResponse.json({ reports: [] });

  const q = req.nextUrl.searchParams.get("systems");
  const systems = q ? q.split(",").filter(Boolean) : undefined;
  const rq = req.nextUrl.searchParams.get("region");
  const region: RegionMode = REGION_MODES.includes(rq as RegionMode) ? (rq as RegionMode) : "USA";
  const reports = datSetReports(systems, region).map((r) => ({
    ...r,
    name: platformBySlug(r.slug)?.name ?? r.slug,
  }));
  return NextResponse.json({ reports });
}
