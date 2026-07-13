import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { listInstalledThemes } from "@/lib/themes";

export const dynamic = "force-dynamic";

// CSS Loader convention: theme CSS references its own assets (backgrounds,
// fonts, images) as url(/themes_custom/<Theme Name>/<file>). On a Steam Deck
// the loader serves each theme folder at that path; GameHub mirrors it here
// so those url() references resolve. Like /api/themes/css, assets are public
// — they're just styling.

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path: segs } = await ctx.params;
  if (!segs || segs.length < 2) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [rawName, ...rest] = segs;
  const name = decodeURIComponent(rawName);

  // Only whitelisted static asset types — never CSS/JSON/etc.
  const ext = path.extname(rest[rest.length - 1]).toLowerCase();
  const mime = MIME[ext];
  if (!mime) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Resolve the theme folder by its display name (what theme CSS uses)
  const theme = listInstalledThemes().find((t) => t.name === name);
  if (!theme) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const base = path.join(process.cwd(), "data", "themes", theme.id);
  const file = path.normalize(path.join(base, ...rest.map(decodeURIComponent)));
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
