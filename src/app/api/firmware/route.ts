import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { platformBySlug } from "@/lib/platforms";
import { biosStatus, importUpload, importZip } from "@/lib/firmware";
import { BIOS_MANIFEST } from "@/lib/biosManifest";

/** BIOS status per system (all BIOS-capable systems, or ?platform=slug for one):
 *  every possible file with region/required + whether it's present & verified. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = req.nextUrl.searchParams.get("platform") ?? undefined;
  return NextResponse.json({ systems: biosStatus(slug) });
}

const isZip = (name: string, type: string) =>
  /\.zip$/i.test(name) || type === "application/zip" || type === "application/x-zip-compressed";

/**
 * Upload BIOS (editor). FormData { platform, file }:
 *  - a single BIOS file → accepted only if its name matches a file this console
 *    expects; the content hash then marks it verified or unverified.
 *  - a .zip → every entry named like an expected BIOS is filed. With `platform`
 *    set, only that console's files are imported; without it, each file goes to
 *    whichever console expects that name. Unexpected names are skipped.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const slug = String(form?.get("platform") ?? "");
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const zip = isZip(file.name, file.type);

  // A single file must target a known BIOS-capable console; a zip may be
  // console-scoped or global (auto-match everything).
  if (!zip) {
    if (!platformBySlug(slug)) return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
    if (!BIOS_MANIFEST[slug]) {
      return NextResponse.json({ error: "This system doesn't use a BIOS" }, { status: 400 });
    }
  } else if (slug && !platformBySlug(slug)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  }

  const max = zip ? 512 * 1024 * 1024 : 64 * 1024 * 1024;
  if (file.size > max) {
    return NextResponse.json(
      { error: `File too large (${zip ? "512MB" : "64MB"} max)` },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (zip) {
    const result = await importZip(slug, buf);
    return NextResponse.json({ ok: true, zip: true, ...result });
  }
  const outcome = await importUpload(slug, file.name, buf);
  return NextResponse.json({ ok: true, zip: false, outcome });
}
