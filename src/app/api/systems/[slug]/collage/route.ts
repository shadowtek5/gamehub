import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  setSystemCustomCollage,
  clearSystemCustomCollage,
  getSystemCustomCovers,
  getSystem,
} from "@/lib/db";
import { buildCustomCollages, refreshDriftedThumbs } from "@/lib/systemThumb";

export const dynamic = "force-dynamic";

/** Current custom-collage state for a system. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const row = getSystem(slug);
  return NextResponse.json({ custom: !!row?.custom_thumb, covers: getSystemCustomCovers(slug) });
}

/** Build a custom collage from a hand-picked set of cover URLs. It overwrites the
 *  auto collages and is protected from the drift-refresh until cleared. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const { slug } = await params;
  if (!getSystem(slug)) return NextResponse.json({ error: "Unknown system" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const covers: string[] = Array.isArray(body?.covers)
    ? body.covers.filter((c: unknown) => typeof c === "string")
    : [];
  if (covers.length === 0) {
    return NextResponse.json({ error: "Pick at least one game with cover art" }, { status: 400 });
  }
  const ok = await buildCustomCollages(slug, covers);
  if (!ok) {
    return NextResponse.json({ error: "None of the chosen games had local cover art" }, { status: 400 });
  }
  setSystemCustomCollage(slug, covers);
  return NextResponse.json({ ok: true, custom: true, covers });
}

/** Revert to the auto-generated cover-mosaic collage. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const { slug } = await params;
  clearSystemCustomCollage(slug);
  // rebuild the auto collage now (sigs were cleared, so this regenerates from top covers)
  await refreshDriftedThumbs([slug]).catch(() => {});
  return NextResponse.json({ ok: true, custom: false, covers: [] });
}
