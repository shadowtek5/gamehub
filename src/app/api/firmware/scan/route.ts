import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { cancelFirmwareScan, getFirmwareScanStatus, startFirmwareScan } from "@/lib/firmwareScan";

export const dynamic = "force-dynamic";

/** Status of the firmware folder scan (and the last folder scanned). */
export async function GET() {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  return NextResponse.json(getFirmwareScanStatus());
}

/** { path } scans a folder on the server for BIOS files and system firmware, filing what it recognizes. */
export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  const body = await req.json().catch(() => ({}));
  const root = typeof body.path === "string" ? body.path : "";
  if (!root.trim()) return NextResponse.json({ error: "path required" }, { status: 400 });
  const err = startFirmwareScan(root);
  if (err) return NextResponse.json({ error: err, ...getFirmwareScanStatus() }, { status: 400 });
  return NextResponse.json(getFirmwareScanStatus());
}

/** Stops a running scan (files already filed stay). */
export async function DELETE() {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  cancelFirmwareScan();
  return NextResponse.json(getFirmwareScanStatus());
}
