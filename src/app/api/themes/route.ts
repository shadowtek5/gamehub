import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listInstalledThemes, installTheme, getCustomCss, setCustomCss } from "@/lib/themes";

export const dynamic = "force-dynamic";

/** Installed themes + custom CSS (admin) */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json({ themes: listInstalledThemes(), customCss: getCustomCss() });
}

/** Install a theme from deckthemes ({id}) or save custom CSS ({customCss}) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  if (typeof body.customCss === "string") {
    if (body.customCss.length > 512 * 1024) {
      return NextResponse.json({ error: "Custom CSS too large" }, { status: 400 });
    }
    setCustomCss(body.customCss);
    return NextResponse.json({ ok: true });
  }

  if (typeof body.id === "string") {
    try {
      const meta = await installTheme(body.id);
      return NextResponse.json({ ok: true, theme: meta });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Install failed" },
        { status: 400 }
      );
    }
  }
  return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
}
