import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import {
  getOidcConfig,
  oidcEnabled,
  discover,
  resolveOidcUser,
} from "@/lib/oidc";

function fail(req: NextRequest, message: string): NextResponse {
  const res = NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(message)}`, req.url)
  );
  res.cookies.delete("gh_oidc");
  return res;
}

/** Complete the OIDC flow: exchange the code, read userinfo, sign in */
export async function GET(req: NextRequest) {
  const config = getOidcConfig();
  if (!oidcEnabled(config)) return fail(req, "SSO is not configured");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const idpError = req.nextUrl.searchParams.get("error_description");
  if (idpError) return fail(req, idpError);
  if (!code || !state) return fail(req, "SSO callback is missing the code");

  let saved: { state?: string; verifier?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get("gh_oidc")?.value ?? "{}");
  } catch {}
  if (!saved.state || saved.state !== state || !saved.verifier) {
    return fail(req, "SSO state mismatch — try signing in again");
  }

  try {
    const endpoints = await discover(config.issuer);
    const redirectUri = new URL("/api/auth/oidc/callback", req.url).toString();

    const tokenRes = await fetch(endpoints.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code_verifier: saved.verifier,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const tokens = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokens.access_token) {
      return fail(
        req,
        tokens.error_description ?? tokens.error ?? `Token exchange failed (HTTP ${tokenRes.status})`
      );
    }

    const infoRes = await fetch(endpoints.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(20_000),
    });
    const info = await infoRes.json().catch(() => ({}));
    if (!infoRes.ok || !info.sub) return fail(req, "Could not read your identity from the IdP");

    const user = resolveOidcUser(
      {
        sub: String(info.sub),
        username: String(info.preferred_username ?? info.name ?? info.email ?? info.sub),
        email: typeof info.email === "string" ? info.email : undefined,
      },
      config.autoCreate
    );
    if (!user) {
      return fail(req, "No GameHub account is linked to this identity (auto-create is off)");
    }

    await createSession(user.id);
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.delete("gh_oidc");
    return res;
  } catch (e) {
    return fail(req, e instanceof Error ? e.message : "SSO failed");
  }
}
