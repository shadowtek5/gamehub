import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, CollectionRow, sanitizeSmartFilters } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = getDb()
    .prepare(
      `SELECT c.*, COUNT(ci.rom_id) AS item_count
       FROM collections c
       LEFT JOIN collection_items ci ON ci.collection_id = c.id
       WHERE c.user_id = ?
       GROUP BY c.id ORDER BY c.name`
    )
    .all(user.id) as CollectionRow[];
  return NextResponse.json({ collections: rows });
}

/** Create a collection. Smart: { isSmart: true, filters: SmartFilters } */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { name, description } = body;
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const isSmart = body.isSmart === true;
  let filters: string | null = null;
  if (isSmart) {
    const clean = sanitizeSmartFilters(body.filters);
    if (Object.keys(clean).length === 0) {
      return NextResponse.json(
        { error: "A smart collection needs at least one filter" },
        { status: 400 }
      );
    }
    filters = JSON.stringify(clean);
  }
  const info = getDb()
    .prepare(
      "INSERT INTO collections (user_id, name, description, is_smart, filters, is_public) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      user.id,
      name.trim(),
      typeof description === "string" ? description.trim() : "",
      isSmart ? 1 : 0,
      filters,
      body.isPublic === true ? 1 : 0
    );
  return NextResponse.json({ ok: true, id: Number(info.lastInsertRowid) });
}
