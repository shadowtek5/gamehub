import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb, RomRow } from "@/lib/db";
import { streamZip } from "@/lib/zipStream";

/** Download a multi-disc game's discs as one streamed zip */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const rom = db.prepare("SELECT * FROM roms WHERE id = ?").get(Number(id)) as
    | RomRow
    | undefined;
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sepIndex = Math.max(rom.path.lastIndexOf("\\"), rom.path.lastIndexOf("/"));
  const dirPrefix = rom.path.slice(0, sepIndex + 1);
  const discs = db
    .prepare(
      `SELECT filename, path FROM roms
       WHERE missing = 0 AND platform_slug = ? AND sort_title = ?
         AND COALESCE(variant, '') = COALESCE(?, '')
         AND disc_number IS NOT NULL AND path LIKE ?
       ORDER BY disc_number`
    )
    .all(rom.platform_slug, rom.sort_title, rom.variant, `${dirPrefix}%`) as {
    filename: string;
    path: string;
  }[];
  if (discs.length < 2) {
    return NextResponse.json({ error: "Not a multi-disc game" }, { status: 400 });
  }

  const zipName = `${path.basename(rom.title).replace(/["\\/]/g, "")}.zip`;
  return new NextResponse(
    streamZip(discs.map((d) => ({ name: d.filename, path: d.path }))),
    {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
      },
    }
  );
}
