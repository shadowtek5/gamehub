import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSystem, setSystemBoxLayout } from "@/lib/db";
import { detectBoxLayout } from "@/lib/systemThumb";

const LAYOUTS = new Set(["auto", "wide", "square", "portrait"]);

/** Set this system's card box-art shape. 'auto' hands it back to the measured
 *  auto-detect value; the concrete shapes override it. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const { slug } = await params;
  if (!getSystem(slug)) return NextResponse.json({ error: "Unknown system" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const layout = body?.layout;
  if (typeof layout !== "string" || !LAYOUTS.has(layout)) {
    return NextResponse.json({ error: "Invalid layout" }, { status: 400 });
  }

  setSystemBoxLayout(slug, layout as "auto" | "wide" | "square" | "portrait");
  // Re-measure so 'auto' immediately reflects the current covers.
  if (layout === "auto") await detectBoxLayout(slug);

  const row = getSystem(slug);
  return NextResponse.json({
    ok: true,
    layout: row?.box_layout ?? "auto",
    layoutAuto: row?.box_layout_auto ?? null,
  });
}
