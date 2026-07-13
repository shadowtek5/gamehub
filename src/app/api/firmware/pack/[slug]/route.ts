import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getSessionUser } from "@/lib/auth";
import { listFirmware, firmwarePath, buildZip } from "@/lib/firmware";

/** A platform's firmware as an uncompressed zip — the game player downloads
 *  this and extracts the files into the core's system folder. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const rows = listFirmware(slug);
  const entries: { name: string; data: Buffer }[] = [];
  for (const row of rows) {
    try {
      entries.push({ name: row.filename, data: await fs.promises.readFile(firmwarePath(row)) });
    } catch {}
  }
  if (entries.length === 0) {
    return NextResponse.json({ error: "No firmware for this platform" }, { status: 404 });
  }
  const zip = buildZip(entries);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}-firmware.zip"`,
      "Content-Length": String(zip.length),
    },
  });
}
