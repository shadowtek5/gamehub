import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { Readable } from "stream";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { deleteFirmware, firmwarePath, FirmwareRow } from "@/lib/firmware";

/** Download one firmware file (players and companion apps) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = getDb().prepare("SELECT * FROM firmware WHERE id = ?").get(Number(id)) as
    | FirmwareRow
    | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const filePath = firmwarePath(row);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File missing on disk" }, { status: 404 });
  }
  // Streamed: firmware packages (PUPs, Switch firmware zips) can be hundreds of MB.
  const { size } = await fs.promises.stat(filePath);
  const body = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream<Uint8Array>;
  const base = row.filename.split("/").pop() ?? row.filename;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${base.replace(/"/g, "")}"`,
      "Content-Length": String(size),
    },
  });
}

/** Remove a firmware file (admin) */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const { id } = await params;
  if (!deleteFirmware(Number(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
