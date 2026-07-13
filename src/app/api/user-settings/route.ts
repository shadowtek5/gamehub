import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getUserSettings, setUserSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Per-user settings key/value bag backing the BPM settings pages */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  return NextResponse.json({ settings: getUserSettings(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }
  let n = 0;
  for (const [key, value] of Object.entries(body)) {
    if (typeof key === "string" && key.length <= 64 && typeof value === "string" && value.length <= 512) {
      setUserSetting(user.id, key, value);
      n++;
      if (n >= 50) break;
    }
  }
  return NextResponse.json({ ok: true, saved: n });
}
