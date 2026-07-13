import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getOidcConfig, setOidcConfig } from "@/lib/oidc";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json({ config: getOidcConfig() });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const current = getOidcConfig();
  setOidcConfig({
    enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
    issuer: typeof body.issuer === "string" ? body.issuer.trim().replace(/\/$/, "") : current.issuer,
    clientId: typeof body.clientId === "string" ? body.clientId.trim() : current.clientId,
    clientSecret:
      typeof body.clientSecret === "string" ? body.clientSecret.trim() : current.clientSecret,
    label: typeof body.label === "string" ? body.label.trim() || "Single Sign-On" : current.label,
    autoCreate: typeof body.autoCreate === "boolean" ? body.autoCreate : current.autoCreate,
  });
  return NextResponse.json({ ok: true, config: getOidcConfig() });
}
