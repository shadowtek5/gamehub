import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSessionUser, hashApiToken } from "@/lib/auth";
import { getDb, getPairRequest, pairRequestExpired, approvePairRequest } from "@/lib/db";

// The signed-in user approves a pairing request: mint an API token for their
// account at the requested scope and hand it to the pairing record so the app
// can retrieve it once via /poll.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = getPairRequest(id);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (pairRequestExpired(row)) return NextResponse.json({ error: "expired" }, { status: 410 });
  if (row.status !== "pending") return NextResponse.json({ error: row.status }, { status: 409 });

  const token = `ghk_${crypto.randomBytes(24).toString("hex")}`;
  getDb()
    .prepare(
      "INSERT INTO api_tokens (user_id, name, token_hash, scope, expires_at) VALUES (?, ?, ?, ?, NULL)"
    )
    .run(user.id, row.device_name ?? "Paired app", hashApiToken(token), row.scope);
  approvePairRequest(id, user.id, token);
  return NextResponse.json({ ok: true });
}
