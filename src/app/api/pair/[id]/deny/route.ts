import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { denyPairRequest, getPairRequest } from "@/lib/db";

// The signed-in user rejects a pairing request.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!getPairRequest(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  denyPairRequest(id);
  return NextResponse.json({ ok: true });
}
