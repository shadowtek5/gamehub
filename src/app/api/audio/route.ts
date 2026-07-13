import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  listAudioPacks,
  installAudioPack,
  getAudioConfig,
  setAudioConfig,
} from "@/lib/audiopacks";

export const dynamic = "force-dynamic";

/** Installed audio packs + config — any signed-in user (the client sound
 *  engine needs mappings to resolve effects) */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  return NextResponse.json({ packs: listAudioPacks(), config: getAudioConfig() });
}

/** Install a pack from deckthemes (admin) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
  }
  try {
    const meta = await installAudioPack(body.id);
    return NextResponse.json({ ok: true, pack: meta });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Install failed" },
      { status: 400 }
    );
  }
}

/** Update the audio config (admin) — selected packs by NAME, volumes 0..1 */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const config = setAudioConfig({
    selected_pack: typeof body.selected_pack === "string" ? body.selected_pack : undefined,
    selected_music: typeof body.selected_music === "string" ? body.selected_music : undefined,
    sound_volume: typeof body.sound_volume === "number" ? body.sound_volume : undefined,
    music_volume: typeof body.music_volume === "number" ? body.music_volume : undefined,
  });
  return NextResponse.json({ ok: true, config });
}
