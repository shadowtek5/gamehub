import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { hashApiToken } from "@/lib/auth";
import { createPairRequest, purgeOldPairRequests } from "@/lib/db";

// Start a device-pairing (QR login) request. Unauthenticated: an external app
// calls this, shows a QR pointing at <server>/pair/<id>, and polls /poll with
// the returned secret until the user approves it on a signed-in device.
const TTL_SECONDS = 300; // 5 minutes to approve

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const device = String(body?.device ?? "").trim().slice(0, 64) || "App";
  const scope = ["full", "editor", "viewer"].includes(body?.scope) ? body.scope : "full";

  purgeOldPairRequests();
  const id = crypto.randomBytes(9).toString("base64url");
  const secret = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
  createPairRequest(id, hashApiToken(secret), device, scope, expiresAt);

  // The app builds the QR from its own known server URL + this id:
  //   <serverUrl>/pair/<id>
  return NextResponse.json({ id, secret, expiresIn: TTL_SECONDS });
}
