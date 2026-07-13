import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/db";
import {
  getStoredProviderConfig,
  setProviderConfig,
  screenscraperConfigured,
  ProviderConfig,
} from "@/lib/providers/config";
import { logEvent } from "@/lib/eventLog";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  // Only what the admin themselves saved — app (developer) credentials are
  // resolved server-side (embedded blob / env) and never leave the server.
  const config = getStoredProviderConfig();
  config.screenscraper.devid = "";
  config.screenscraper.devpassword = "";
  return NextResponse.json({
    config,
    // "does ScreenScraper have working app credentials from ANY source"
    ssDevConfigured: screenscraperConfigured(),
    // opt-in: accept ScreenScraper's cert even when expired/misconfigured
    ssInsecureTls: getSetting("ss_insecure_tls") === "on",
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  // ScreenScraper TLS override (standalone toggle, not a credential).
  if (typeof body?.ssInsecureTls === "boolean") {
    setSetting("ss_insecure_tls", body.ssInsecureTls ? "on" : "off");
  }

  // Fall back to STORED values so resolved env/embedded secrets are never
  // copied into the database by a save round-trip.
  const current = getStoredProviderConfig();
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v.trim() : fallback);
  const next: ProviderConfig = {
    screenscraper: {
      devid: str(body?.screenscraper?.devid, current.screenscraper.devid),
      devpassword: str(body?.screenscraper?.devpassword, current.screenscraper.devpassword),
      softname: str(body?.screenscraper?.softname, current.screenscraper.softname) || "GameHub",
      ssid: str(body?.screenscraper?.ssid, current.screenscraper.ssid),
      sspassword: str(body?.screenscraper?.sspassword, current.screenscraper.sspassword),
    },
    emumovies: {
      username: str(body?.emumovies?.username, current.emumovies.username),
      password: str(body?.emumovies?.password, current.emumovies.password),
    },
    igdb: {
      clientId: str(body?.igdb?.clientId, current.igdb.clientId),
      clientSecret: str(body?.igdb?.clientSecret, current.igdb.clientSecret),
    },
    mobygames: {
      apiKey: str(body?.mobygames?.apiKey, current.mobygames.apiKey),
    },
    steamgriddb: {
      apiKey: str(body?.steamgriddb?.apiKey, current.steamgriddb.apiKey),
    },
    thegamesdb: {
      apiKey: str(body?.thegamesdb?.apiKey, current.thegamesdb.apiKey),
    },
  };
  setProviderConfig(next);
  logEvent({
    category: "settings",
    action: "settings.changed",
    summary: "Updated metadata provider credentials",
    actor: user,
  });
  return NextResponse.json({ ok: true });
}
