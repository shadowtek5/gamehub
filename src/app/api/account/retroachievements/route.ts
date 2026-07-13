import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getRaLink, raVerifyKey, saveRaLink, clearRaLink } from "@/lib/userRa";

// Per-user RetroAchievements account link (managed from the account page and
// mobile profile). A GameHub user links their own RA account by pasting their
// RetroAchievements Web API key; we validate it once and store the username +
// sealed key. Those credentials pull the user's achievement lists and unlock
// progress on the game and profile pages. The key is read-only.

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(getRaLink(user.id));
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim();
  const apiKey = String(body.apiKey ?? "").trim();
  if (!username || !apiKey) {
    return NextResponse.json({ error: "Username and Web API key required" }, { status: 400 });
  }

  try {
    const { username: raUser, apiKey: key } = await raVerifyKey(username, apiKey);
    saveRaLink(user.id, raUser, key);
    return NextResponse.json(getRaLink(user.id));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to link account" },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  clearRaLink(user.id);
  return NextResponse.json({ ok: true });
}
