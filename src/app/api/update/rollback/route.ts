import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { selfUpdateSupported } from "@/lib/update/manifest";
import { rollbackTo, requestRestart } from "@/lib/update/installer";
import { IMAGE } from "@/lib/update/paths";

export const dynamic = "force-dynamic";

/** Revert to the baked-in image build (default) or a specific installed
 *  release, then restart to apply. Admin only. */
export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  if (!selfUpdateSupported()) {
    return NextResponse.json({ error: "notSupported" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const target: string = typeof body?.version === "string" && body.version ? body.version : IMAGE;

  try {
    rollbackTo(target);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  requestRestart();
  return NextResponse.json({ ok: true, restarting: true, target });
}
