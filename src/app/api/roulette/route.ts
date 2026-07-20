import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { randomGame } from "@/lib/db";
import { PLATFORMS_SORTED, platformBySlug } from "@/lib/platforms";

/** "Surprise me" — one random game matching the filters.
 *  ?playable=1        only systems GameHub can emulate in-browser
 *  ?system=slug       a specific system
 *  ?genre=Shooter     genre contains
 *  ?unplayed=1        never played
 *  ?maxHours=10       HowLongToBeat main story at most N hours */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  const sp = req.nextUrl.searchParams;

  const system = sp.get("system") || undefined;
  const playable = sp.get("playable") === "1";
  const platforms = system
    ? [system]
    : playable
    ? PLATFORMS_SORTED.filter((p) => p.ejsCore).map((p) => p.slug)
    : undefined;

  const maxHours = Number(sp.get("maxHours")) || 0;
  const rom = randomGame(user.id, {
    platforms,
    genre: sp.get("genre") || undefined,
    unplayedOnly: sp.get("unplayed") === "1",
    maxSeconds: maxHours > 0 ? maxHours * 3600 : undefined,
  });

  if (!rom) return NextResponse.json({ rom: null });
  const p = platformBySlug(rom.platform_slug);
  return NextResponse.json({
    rom: {
      ...rom,
      platform_name: p?.name ?? rom.platform_slug,
      playable: !!p?.ejsCore,
    },
  });
}
