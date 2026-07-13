import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { platformBySlug } from "@/lib/platforms";
import {
  buildGamelistXml,
  buildRetroarchLpl,
  buildM3uPlaylists,
  zipTextFiles,
} from "@/lib/export";

/** Download an export for a system.
 *  format: gamelist (ES-DE XML) | retroarch (.lpl) | m3u (zip of playlists). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ format: string; slug: string }> }
) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  const { format, slug } = await params;
  const name = platformBySlug(slug)?.name ?? slug;

  const attach = (body: Buffer | string, filename: string, type: string) =>
    new NextResponse(typeof body === "string" ? body : new Uint8Array(body), {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      },
    });

  if (format === "gamelist") {
    return attach(buildGamelistXml(slug), "gamelist.xml", "application/xml; charset=utf-8");
  }
  if (format === "retroarch") {
    return attach(buildRetroarchLpl(slug), `${name}.lpl`, "application/json; charset=utf-8");
  }
  if (format === "m3u") {
    const playlists = buildM3uPlaylists(slug);
    if (playlists.length === 0) {
      return NextResponse.json({ error: "No multi-disc games in this system" }, { status: 404 });
    }
    return attach(zipTextFiles(playlists), `${name} - m3u playlists.zip`, "application/zip");
  }
  return NextResponse.json({ error: "Unknown export format" }, { status: 400 });
}
