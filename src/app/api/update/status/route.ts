import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getStatus } from "@/lib/update/service";

export const dynamic = "force-dynamic";

/** Current update status: running/booted/image versions, staged release,
 *  installed releases, settings, and any cached available update. Admin only. */
export async function GET() {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  return NextResponse.json(getStatus());
}
