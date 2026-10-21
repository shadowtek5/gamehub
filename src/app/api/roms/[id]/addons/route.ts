import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { addonParent, gameAddons } from "@/lib/addons";
import { streamZip } from "@/lib/zipStream";

/**
 * A game's DLC, updates and licenses. `?zip=1` downloads them all as one streamed zip
 * (folder-based add-ons, e.g. Wii U, are left out of the zip).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const rom = getDb().prepare("SELECT id, title FROM roms WHERE id = ? AND missing = 0").get(Number(id)) as
    | { id: number; title: string }
    | undefined;
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const addons = gameAddons(rom.id);

  if (req.nextUrl.searchParams.get("zip") !== "1") {
    return NextResponse.json({ addons, addon_of: addonParent(rom.id) });
  }
  const paths = getDb().prepare("SELECT path FROM roms WHERE id = ?");
  const files = addons
    .map((a) => ({ name: a.filename, path: (paths.get(a.id) as { path: string }).path }))
    .filter((f) => {
      try {
        return fs.statSync(f.path).isFile();
      } catch {
        return false;
      }
    });
  if (!files.length) return NextResponse.json({ error: "No DLC or updates to download" }, { status: 404 });
  const zipName = `${path.basename(rom.title).replace(/["\\/]/g, "")} - DLC & updates.zip`;
  return new NextResponse(streamZip(files), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
    },
  });
}
