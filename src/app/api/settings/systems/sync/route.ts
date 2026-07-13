import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { syncSystems } from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";

/**
 * Check the supported-systems manifest and insert any consoles missing from the
 * systems table (new systems added since the table was last seeded). Also
 * refreshes each row's manifest columns. Returns the newly-added systems.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const added = syncSystems();
  return NextResponse.json({
    ok: true,
    added,
    names: added.map((slug) => platformBySlug(slug)?.name ?? slug),
  });
}
