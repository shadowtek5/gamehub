import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { setSetting } from "@/lib/db";
import {
  AUTO_DECRYPT_SETTING,
  cancelVitaDecryptJob,
  getVitaDecryptJobStatus,
  isAutoDecryptOn,
} from "@/lib/vitaDecryptJob";
import { findPfsdec } from "@/lib/vitaPfs";
import { cancelQueuedKind, enqueueVitaDecrypt, vitaDecryptPendingOrRunning } from "@/lib/jobQueue";

export const dynamic = "force-dynamic";

function snapshot() {
  return { available: findPfsdec() !== null, auto: isAutoDecryptOn(), ...getVitaDecryptJobStatus() };
}

/** Status of the PS Vita decrypt job, whether the tool is installed, and the auto setting. */
export async function GET() {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  return NextResponse.json(snapshot());
}

/** { auto: boolean } toggles decrypting after scans; otherwise queues a decrypt of every PS Vita zip. */
export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  const body = await req.json().catch(() => ({}));
  if (typeof body.auto === "boolean") {
    setSetting(AUTO_DECRYPT_SETTING, body.auto ? "on" : "off");
    return NextResponse.json(snapshot());
  }
  if (!findPfsdec()) {
    return NextResponse.json({ error: "vita-pfsdec isn't installed on this server", ...snapshot() }, { status: 400 });
  }
  if (vitaDecryptPendingOrRunning()) {
    return NextResponse.json({ started: false, queued: false, ...snapshot() });
  }
  const res = enqueueVitaDecrypt();
  return NextResponse.json({ started: res.started, queued: !res.started, position: res.position, ...snapshot() });
}

/** Cancel a running or queued decrypt. The game being processed keeps its original zip. */
export async function DELETE() {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  cancelQueuedKind("vitadecrypt");
  cancelVitaDecryptJob();
  return NextResponse.json(snapshot());
}
