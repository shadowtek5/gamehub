import { NextRequest, NextResponse } from "next/server";
import { hashApiToken } from "@/lib/auth";
import { getPairRequest, pairRequestExpired, consumePairToken } from "@/lib/db";

// The external app polls this with its `secret` until the user approves. On
// approval it returns the minted token exactly once (then it's consumed).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const secret = String(body?.secret ?? "");

  const row = getPairRequest(id);
  if (!row) return NextResponse.json({ status: "not_found" }, { status: 404 });
  // Only the app that started the request (holds the secret) may poll it.
  if (!secret || hashApiToken(secret) !== row.secret_hash) {
    return NextResponse.json({ error: "bad_secret" }, { status: 403 });
  }
  if (row.status === "pending" && pairRequestExpired(row)) {
    return NextResponse.json({ status: "expired" });
  }
  if (row.status === "approved") {
    const token = consumePairToken(id);
    return NextResponse.json({ status: "approved", token, scope: row.scope });
  }
  // pending | denied | consumed
  return NextResponse.json({ status: row.status });
}
