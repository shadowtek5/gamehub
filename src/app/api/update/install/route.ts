import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { selfUpdateSupported } from "@/lib/update/manifest";
import { installLatestFromFeed } from "@/lib/update/service";

export const dynamic = "force-dynamic";

/** Download + SHA-256 verify + unpack the latest feed release and stage it as
 *  the next boot. Does NOT restart — call /api/update/apply to apply. */
export async function POST() {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  if (!selfUpdateSupported()) {
    return NextResponse.json({ error: "notSupported" }, { status: 400 });
  }
  try {
    const staged = await installLatestFromFeed();
    if (!staged) return NextResponse.json({ ok: true, staged: null, upToDate: true });
    return NextResponse.json({ ok: true, staged });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
