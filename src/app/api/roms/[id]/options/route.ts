import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, getLibraryRom } from "@/lib/db";

/** The data the game options menu needs, so it can be opened as a per-card
 *  context menu from any grid (mirrors what the game page passes directly). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const romId = Number(id);
  const rom = getLibraryRom(user.id, romId);
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const collections = getDb()
    .prepare(
      `SELECT c.id, c.name,
              EXISTS(SELECT 1 FROM collection_items ci
                     WHERE ci.collection_id = c.id AND ci.rom_id = ?) AS has_rom
       FROM collections c WHERE c.user_id = ? AND c.is_smart = 0 ORDER BY c.name`
    )
    .all(romId, user.id) as { id: number; name: string; has_rom: number }[];

  return NextResponse.json({
    romId,
    title: rom.title,
    filename: rom.filename ?? "",
    favorite: rom.favorite === 1,
    hidden: rom.hidden === 1,
    hasManual: !!rom.manual_url,
    isAdmin: user.isEditor,
    collections: collections.map((c) => ({ id: c.id, name: c.name, hasRom: c.has_rom === 1 })),
  });
}
