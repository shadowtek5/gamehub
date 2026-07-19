import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getSystemArt,
  scrapeSystemArt,
  setSystemArt,
  useGeneratedRibbonHero,
} from "@/lib/systemArt";
import { assertPublicHttpUrl } from "@/lib/ssrfGuard";
import {
  systemOpKey,
  startOpProgress,
  setOpProgress,
  finishOpProgress,
  getOpProgress,
} from "@/lib/opProgress";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  // ?progress=<op> polls a live art download/scrape (drives the cog modal).
  const op = req.nextUrl.searchParams.get("progress");
  if (op) return NextResponse.json(getOpProgress(systemOpKey(slug, op)) ?? { phase: "idle" });
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
  const key = systemOpKey(slug, "artall");
  startOpProgress(key, "items");
  let got;
  try {
    ({ got } = await scrapeSystemArt(slug, force, (done, total, label) =>
      setOpProgress(key, { phase: "media", unit: "items", done, total, label })
    ));
  } catch (e) {
    finishOpProgress(key, e instanceof Error ? e.message : "Fetch failed");
    throw e;
  }
  finishOpProgress(key);
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
  // A real remote download shows a byte-progress bar; clearing/suppressing is instant.
  const downloading = typeof url === "string" && /^https?:\/\//i.test(url) && suppress !== true;
  const key = systemOpKey(slug, kind);
  if (downloading) startOpProgress(key, "bytes");
  const result = await setSystemArt(
    slug,
    kind,
    url ?? null,
    suppress === true,
    downloading
      ? (bytes, total) => setOpProgress(key, { phase: "downloading", unit: "bytes", done: bytes, total })
      : undefined
  );
  if (downloading) finishOpProgress(key, result.ok ? undefined : result.error);
  if (!result.ok) return NextResponse.json({ error: result.error ?? "Failed" }, { status: 502 });
  return NextResponse.json({ ok: true, ...getSystemArt(slug) });
}
