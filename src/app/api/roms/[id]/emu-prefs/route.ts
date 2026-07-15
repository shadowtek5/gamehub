import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getEmuPrefs, setEmuShader } from "@/lib/db";

// Per-user, per-game emulator A/V prefs (currently the video shader). GET reads;
// PUT { shader } saves. Applied to EmulatorJS at the next launch.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json(getEmuPrefs(user.id, Number(id)));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const shader = typeof body?.shader === "string" ? body.shader : null;
  setEmuShader(user.id, Number(id), shader);
  return NextResponse.json({ ok: true, ...getEmuPrefs(user.id, Number(id)) });
}
