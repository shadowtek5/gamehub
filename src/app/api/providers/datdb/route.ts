import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { datStatus, getDatImportStatus, startDatImport, DAT_CATEGORIES } from "@/lib/providers/datdb";
import { logEvent } from "@/lib/eventLog";

/** DAT hash-DB state + live import progress + selectable import categories */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json({
    status: datStatus(),
    import: getDatImportStatus(),
    categories: DAT_CATEGORIES.map((c) => ({ key: c.key, label: c.label, note: c.note, default: c.default })),
  });
}

/** Start downloading + importing the libretro-database DAT sets. Optional body
 *  { categories: ["no-intro", "redump", ...] } (default: cartridges + discs). */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const categories = Array.isArray(body?.categories)
    ? body.categories.filter((x: unknown) => typeof x === "string")
    : undefined;
  const started = startDatImport(categories);
  if (!started) {
    return NextResponse.json(
      { error: "An import is already running", import: getDatImportStatus() },
      { status: 409 }
    );
  }
  logEvent({
    category: "maintenance",
    action: "maintenance.dat_import",
    summary: `DAT hash-database import started${categories ? ` (${categories.join(", ")})` : ""}`,
    detail: { categories: categories ?? null },
    actor: user,
  });
  return NextResponse.json({ ok: true, import: getDatImportStatus() });
}
