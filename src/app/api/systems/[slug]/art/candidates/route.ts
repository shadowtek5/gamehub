import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { systemArtCandidates } from "@/lib/systemArt";

/** Candidates for a system's art pickers (?kind=hero|logo|icon|ribbon). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { slug } = await params;
  const raw = req.nextUrl.searchParams.get("kind");
  const kind =
    raw === "logo" || raw === "icon" || raw === "ribbon" ? raw : "hero";
  const { candidates, errors } = await systemArtCandidates(slug, kind);
  return NextResponse.json({ candidates, errors });
}
