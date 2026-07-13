import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSessionUser, hashApiToken } from "@/lib/auth";
import { getDb } from "@/lib/db";

/** List the signed-in user's API tokens (hashes never leave the server) */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tokens = getDb()
    .prepare(
      "SELECT id, name, scope, created_at, last_used_at, expires_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(user.id);
  return NextResponse.json({ tokens });
}

/** Create a token: { name, scope, expiresInDays? } — value returned exactly once.
 *  expiresInDays: a positive number sets an expiry; 0/omitted = never expires. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 64) || "API token";
  // Scope caps the token's effective role: full (act as you) / editor / viewer
  const scope = ["full", "editor", "viewer"].includes(body.scope) ? body.scope : "full";
  const days = Number(body.expiresInDays);
  const expiresAt =
    Number.isFinite(days) && days > 0
      ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
      : null;
  const token = `ghk_${crypto.randomBytes(24).toString("hex")}`;
  const info = getDb()
    .prepare(
      "INSERT INTO api_tokens (user_id, name, token_hash, scope, expires_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(user.id, name, hashApiToken(token), scope, expiresAt);
  return NextResponse.json({
    ok: true,
    id: Number(info.lastInsertRowid),
    name,
    scope,
    expires_at: expiresAt,
    token,
  });
}
