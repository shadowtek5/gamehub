import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { getSessionUser } from "@/lib/auth";
import { getDb, RomRow } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rom = getDb().prepare("SELECT * FROM roms WHERE id = ?").get(Number(id)) as
    | RomRow
    | undefined;
  if (!rom || !fs.existsSync(rom.path)) {
    return NextResponse.json({ error: "ROM file not found" }, { status: 404 });
  }

  const stat = fs.statSync(rom.path);
  // Folder-based ROMs (e.g. an extracted Wii U title) aren't a single file to
  // stream — there's nothing to download directly.
  if (stat.isDirectory()) {
    return NextResponse.json(
      { error: "This is a folder-based game and can't be downloaded as a single file." },
      { status: 415 }
    );
  }
  const download = req.nextUrl.searchParams.get("download") === "1";
  const headers = new Headers({
    "Content-Length": String(stat.size),
    "Content-Type": "application/octet-stream",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(
      path.basename(rom.path)
    )}"`,
    "Accept-Ranges": "bytes",
  });

  // Range support so large disc images can be seeked/resumed
  const range = req.headers.get("range");
  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(parseInt(match[2], 10), stat.size - 1) : stat.size - 1;
      if (start <= end && start < stat.size) {
        headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
        headers.set("Content-Length", String(end - start + 1));
        const stream = Readable.toWeb(
          fs.createReadStream(rom.path, { start, end })
        ) as ReadableStream;
        return new NextResponse(stream, { status: 206, headers });
      }
    }
  }

  const stream = Readable.toWeb(fs.createReadStream(rom.path)) as ReadableStream;
  return new NextResponse(stream, { status: 200, headers });
}
