import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// AudioLoader convention: pack audio is served from
// /sounds_custom/<packDir>/<file> (on a Deck this is a symlink into
// steamui). GameHub's pack dirs are keyed by the deckthemes id.

const MIME: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".opus": "audio/opus",
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path: segs } = await ctx.params;
  if (!segs || segs.length < 2) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [packDir, ...rest] = segs.map(decodeURIComponent);
  if (!/^[0-9a-f-]{36}$/i.test(packDir)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ext = path.extname(rest[rest.length - 1]).toLowerCase();
  const mime = MIME[ext];
  if (!mime) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const base = path.join(process.cwd(), "data", "audio", packDir);
  const file = path.normalize(path.join(base, ...rest));
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
    headers: { "Content-Type": mime, "Cache-Control": "public, max-age=3600" },
  });
}
