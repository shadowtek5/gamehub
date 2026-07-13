import { NextResponse } from "next/server";
import os from "os";
import { getSessionUser } from "@/lib/auth";
import packageJson from "../../../../package.json";

export const dynamic = "force-dynamic";

/** Server facts for the Settings → System page (About / Hardware sections) */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const cpus = os.cpus();
  const first = cpus[0];
  return NextResponse.json({
    hostname: os.hostname(),
    osName: `${os.type()} ${os.release()}`,
    platform: process.platform,
    version: (packageJson as { version?: string }).version ?? "0.0.0",
    nodeVersion: process.version,
    uptimeSec: Math.floor(process.uptime()),
    cpuName: first?.model?.trim() ?? "Unknown",
    cpuFrequencyMhz: first?.speed ?? 0,
    cpuLogicalCores: cpus.length,
    ramBytes: os.totalmem(),
  });
}
