import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getUpdateSettings, setUpdateSettings } from "@/lib/update/service";

export const dynamic = "force-dynamic";

/** Update the auto-update preferences (auto-check, auto-apply, channel, repo,
 *  interval). Admin only. */
export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  const body = await req.json().catch(() => ({}));
  setUpdateSettings({
    autoCheck: typeof body?.autoCheck === "boolean" ? body.autoCheck : undefined,
    autoApply: typeof body?.autoApply === "boolean" ? body.autoApply : undefined,
    channel: typeof body?.channel === "string" ? body.channel : undefined,
    repo: typeof body?.repo === "string" ? body.repo : undefined,
    intervalHours: typeof body?.intervalHours === "number" ? body.intervalHours : undefined,
  });
  return NextResponse.json({ ok: true, settings: getUpdateSettings() });
}
