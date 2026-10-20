import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listBatterySaves, listDeviceSaves } from "@/lib/saveSync";

export const dynamic = "force-dynamic";

/**
 * Every save of the signed-in user with its version, for sync clients:
 * { battery: [{ romId, sha256, size, updatedAt }],
 *   device:  [{ platform, key, romId, title, device, sha256, size, updatedAt }] }
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ battery: listBatterySaves(user.id), device: listDeviceSaves(user.id) });
}
