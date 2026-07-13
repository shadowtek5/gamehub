import { NextResponse } from "next/server";
import { getOidcConfig, oidcEnabled } from "@/lib/oidc";

/** Public: does the login page show an SSO button, and what does it say */
export async function GET() {
  const config = getOidcConfig();
  return NextResponse.json({
    enabled: oidcEnabled(config),
    label: config.label || "Single Sign-On",
  });
}
