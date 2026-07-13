import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { updateTheme, deleteTheme } from "@/lib/themes";

export const dynamic = "force-dynamic";

/** Enable/disable a theme or change its patch options (admin) */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    const meta = updateTheme(id, {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      selected: body.selected && typeof body.selected === "object" ? body.selected : undefined,
      componentValues:
        body.componentValues && typeof body.componentValues === "object"
          ? body.componentValues
          : undefined,
    });
    return NextResponse.json({ ok: true, theme: meta });
  } catch {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }
}

/** Uninstall (admin) */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const { id } = await ctx.params;
  try {
    deleteTheme(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 400 }
    );
  }
}
