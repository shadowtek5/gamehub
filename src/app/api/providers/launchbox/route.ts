import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { lbStatus, getLbImportStatus, startLbImport } from "@/lib/providers/launchbox";

/** LaunchBox DB state + live import progress */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return NextResponse.json({ status: lbStatus(), import: getLbImportStatus() });
}

/** Start downloading + importing the LaunchBox Metadata database */
export async function POST() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const started = startLbImport();
  if (!started) {
    return NextResponse.json(
      { error: "An import is already running", import: getLbImportStatus() },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, import: getLbImportStatus() });
}
