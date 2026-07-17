import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPairRequest, pairRequestExpired } from "@/lib/db";

// Details for the approval page (who's asking, current status). Authenticated —
// only a signed-in user can look at / approve a pairing request.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = getPairRequest(id);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    device: row.device_name,
    scope: row.scope,
    status: row.status,
    expired: pairRequestExpired(row),
  });
}
