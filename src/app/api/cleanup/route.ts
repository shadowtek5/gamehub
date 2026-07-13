import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { countMissing, orphanMediaDirs, runCleanup } from "@/lib/cleanup";

function parseSystems(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((s): s is string => typeof s === "string");
  if (typeof value === "string" && value) return value.split(",").filter(Boolean);
  return [];
}

/** Report what a cleanup would remove (optionally ?systems=slug,slug) */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const systems = parseSystems(req.nextUrl.searchParams.get("systems"));
  return NextResponse.json({
    missing: countMissing(systems),
    orphanMedia: orphanMediaDirs().length,
  });
}

/** Run cleanup (optionally scoped to { systems: [...] }) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const result = runCleanup(parseSystems(body?.systems));
  return NextResponse.json({ ok: true, ...result });
}
