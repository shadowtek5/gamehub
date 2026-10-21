import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { compatListsStatus, startCompatRefresh } from "@/lib/compatLists";

export const dynamic = "force-dynamic";

/** The official compatibility lists (RPCS3, Vita3K, PCSX2): when they were updated, how many
 *  of your games each matched, and the refresh's progress. */
export async function GET() {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  return NextResponse.json(compatListsStatus());
}

/** Downloads the lists again and matches games ({ rematch: true } forgets every game's serial first). */
export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  const body = await req.json().catch(() => ({}));
  const started = startCompatRefresh(body?.rematch === true);
  return NextResponse.json({ started, ...compatListsStatus() });
}
