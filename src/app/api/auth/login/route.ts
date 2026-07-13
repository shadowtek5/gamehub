import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials, createSession } from "@/lib/auth";
import { rateLimit, clearRateLimit, clientIp } from "@/lib/rateLimit";

const WINDOW_MS = 5 * 60 * 1000;

function tooMany(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: "Too many attempts — try again in a few minutes" },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({}));
  if (typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  // Throttle brute force: per IP+username (targeted guessing) and per IP
  // (spraying many usernames from one source).
  const ip = clientIp(req);
  const userKey = `login:${ip}:${username.trim().toLowerCase()}`;
  const ipKey = `login-ip:${ip}`;
  const perUser = rateLimit(userKey, 10, WINDOW_MS);
  if (!perUser.ok) return tooMany(perUser.retryAfterSec);
  const perIp = rateLimit(ipKey, 50, WINDOW_MS);
  if (!perIp.ok) return tooMany(perIp.retryAfterSec);

  const user = verifyCredentials(username, password);
  if (!user) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }
  clearRateLimit(userKey); // a legit login shouldn't count toward a lockout
  await createSession(user.id);
  return NextResponse.json({ ok: true, user });
}
