import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getSystemArt,
  scrapeSystemArt,
  setSystemArt,
  useGeneratedRibbonHero,
} from "@/lib/systemArt";
import { assertPublicHttpUrl } from "@/lib/ssrfGuard";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  return NextResponse.json(getSystemArt(slug));
}

/** Scrape this system's art from configured providers. ?force=1 re-fetches. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const { slug } = await params;
  const force = req.nextUrl.searchParams.get("force") === "1";
  const { got } = await scrapeSystemArt(slug, force);
  return NextResponse.json({ ok: true, got, ...getSystemArt(slug) });
}

/** Set (or clear) a system's hero/logo from a chosen candidate URL. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const { slug } = await params;
  const { kind, url, suppress, source } = await req.json().catch(() => ({}));

  // Special case: choose the generated cover collage as the hero (no download).
  if (kind === "hero" && source === "ribbon") {
    // Not a React hook — a server helper that happens to start with "use".
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useGeneratedRibbonHero(slug);
    return NextResponse.json({ ok: true, ...getSystemArt(slug) });
  }

  if (kind !== "hero" && kind !== "logo" && kind !== "icon" && kind !== "ribbon") {
    return NextResponse.json(
      { error: "kind must be 'hero', 'logo', 'icon' or 'ribbon'" },
      { status: 400 }
    );
  }
  if (url != null && typeof url !== "string") {
    return NextResponse.json({ error: "url must be a string (or null to clear)" }, { status: 400 });
  }
  // Remote URLs are fetched server-side — block private/reserved targets (SSRF).
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    try {
      await assertPublicHttpUrl(url);
    } catch {
      return NextResponse.json({ error: "URL is not an allowed public address" }, { status: 400 });
    }
  }
  const result = await setSystemArt(slug, kind, url ?? null, suppress === true);
  if (!result.ok) return NextResponse.json({ error: result.error ?? "Failed" }, { status: 502 });
  return NextResponse.json({ ok: true, ...getSystemArt(slug) });
}
