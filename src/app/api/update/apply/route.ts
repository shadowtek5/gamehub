import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { selfUpdateSupported } from "@/lib/update/manifest";
import { stageRelease, requestRestart } from "@/lib/update/installer";
import { readMarker, installedReleases, IMAGE } from "@/lib/update/paths";

export const dynamic = "force-dynamic";

/** Apply a staged update by restarting the process (the container restart
 *  policy relaunches it and the entrypoint boots the staged release).
 *  Optionally { version } to switch to a specific already-installed release
 *  first. Admin only. */
export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  if (!selfUpdateSupported()) {
    return NextResponse.json({ error: "notSupported" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const version: string | undefined = body?.version;

  if (version && version !== IMAGE && !installedReleases().includes(version)) {
    return NextResponse.json({ error: "Release not installed" }, { status: 400 });
  }
  if (version) stageRelease(version);

  const target = version ?? readMarker("current");
  if (!target || target === IMAGE) {
    return NextResponse.json({ error: "Nothing staged to apply" }, { status: 400 });
  }

  requestRestart();
  return NextResponse.json({ ok: true, restarting: true, target });
}
