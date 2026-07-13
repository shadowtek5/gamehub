import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getDb,
  CollectionRow,
  BrowseRomRow,
  listSmartCollectionRoms,
  parseSmartFilters,
} from "@/lib/db";
import { logActivity } from "@/lib/activity";

/** Read one collection (own or public) with its games */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const collection = getDb()
    .prepare(
      "SELECT * FROM collections WHERE id = ? AND (user_id = ? OR is_public = 1)"
    )
    .get(Number(id), user.id) as CollectionRow | undefined;
  if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const roms: BrowseRomRow[] =
    collection.is_smart === 1
      ? listSmartCollectionRoms(user.id, parseSmartFilters(collection.filters), 1000)
      : (getDb()
          .prepare(
            `SELECT r.id, r.title, r.boxart_url, r.platform_slug, r.variant, r.language, r.added_at,
                    COALESCE(ur.favorite, 0) AS favorite,
                    COALESCE(ur.play_status, 'none') AS play_status,
                    COALESCE(ur.playtime_seconds, 0) AS playtime_seconds,
                    COALESCE(ur.hidden, 0) AS hidden
             FROM collection_items ci
             JOIN roms r ON r.id = ci.rom_id AND r.missing = 0
             LEFT JOIN user_roms ur ON ur.rom_id = r.id AND ur.user_id = ?
             WHERE ci.collection_id = ? ORDER BY r.sort_title`
          )
          .all(user.id, collection.id) as BrowseRomRow[]);
  return NextResponse.json({
    collection: { ...collection, filters: parseSmartFilters(collection.filters) },
    roms,
  });
}

function ownCollection(userId: number, collectionId: number) {
  return getDb()
    .prepare("SELECT id, is_smart FROM collections WHERE id = ? AND user_id = ?")
    .get(collectionId, userId) as { id: number; is_smart: number } | undefined;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!ownCollection(user.id, Number(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  getDb().prepare("DELETE FROM collections WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}

/** Add or remove a rom: body { romId, action: "add" | "remove" } */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const collectionId = Number(id);
  const collection = ownCollection(user.id, collectionId);
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (collection.is_smart === 1) {
    return NextResponse.json(
      { error: "Smart collections manage their own membership — edit the filters instead" },
      { status: 400 }
    );
  }
  const { romId, action } = await req.json().catch(() => ({}));
  if (typeof romId !== "number" || !["add", "remove"].includes(action)) {
    return NextResponse.json({ error: "romId and action required" }, { status: 400 });
  }
  if (action === "add") {
    const info = getDb()
      .prepare(
        "INSERT OR IGNORE INTO collection_items (collection_id, rom_id) VALUES (?, ?)"
      )
      .run(collectionId, romId);
    if (info.changes > 0) {
      const c = getDb()
        .prepare("SELECT name FROM collections WHERE id = ?")
        .get(collectionId) as { name: string } | undefined;
      logActivity({
        userId: user.id,
        romId,
        type: "collection",
        summary: `Added to collection${c ? ` — ${c.name}` : ""}`,
      });
    }
  } else {
    getDb()
      .prepare("DELETE FROM collection_items WHERE collection_id = ? AND rom_id = ?")
      .run(collectionId, romId);
  }
  return NextResponse.json({ ok: true });
}
