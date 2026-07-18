import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { checkForUpdate } from "@/lib/update/service";

export const dynamic = "force-dynamic";

/** Force a live check of the GitHub Releases feed and cache the result. */
export async function POST() {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  const result = await checkForUpdate(true);
  return NextResponse.json(result);
}
