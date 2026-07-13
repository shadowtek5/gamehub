import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getOidcConfig, oidcEnabled, discover, pkcePair } from "@/lib/oidc";

/** Kick off the OIDC authorization-code flow (with PKCE) */
export async function GET(req: NextRequest) {
  const config = getOidcConfig();
  if (!oidcEnabled(config)) {
    return NextResponse.redirect(new URL("/login?error=SSO+is+not+configured", req.url));
  }

  try {
    const endpoints = await discover(config.issuer);
    const state = crypto.randomBytes(16).toString("base64url");
    const { verifier, challenge } = pkcePair();
    const redirectUri = new URL("/api/auth/oidc/callback", req.url).toString();

    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: "openid profile email",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    const res = NextResponse.redirect(`${endpoints.authorization_endpoint}?${params}`);
    const secure =
      (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", ""))
        .split(",")[0]
        .trim() === "https";
    res.cookies.set("gh_oidc", JSON.stringify({ state, verifier }), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
      secure,
    });
    return res;
  } catch (e) {
    const msg = encodeURIComponent(e instanceof Error ? e.message : "SSO failed");
    return NextResponse.redirect(new URL(`/login?error=${msg}`, req.url));
  }
}
