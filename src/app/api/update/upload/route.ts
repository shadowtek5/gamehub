import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { requireAdmin } from "@/lib/auth";
import { appRoot } from "@/lib/update/paths";
import { selfUpdateSupported } from "@/lib/update/manifest";
import { installUploadedZip } from "@/lib/update/service";

export const dynamic = "force-dynamic";

/** Install an admin-uploaded release zip (raw request body, application/zip).
 *  Streams to a temp file, validates + unpacks it, and stages it as the next
 *  boot. Does NOT restart — call /api/update/apply to apply. Admin only. */
export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  if (!selfUpdateSupported()) {
    return NextResponse.json({ error: "notSupported" }, { status: 400 });
  }
  if (!req.body) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const dir = path.join(appRoot(), "downloads");
  fs.mkdirSync(dir, { recursive: true });
  const upload = path.join(dir, `upload-${crypto.randomBytes(6).toString("hex")}.zip`);

  try {
    await pipeline(
      Readable.fromWeb(req.body as import("stream/web").ReadableStream<Uint8Array>),
      fs.createWriteStream(upload)
    );
    const staged = await installUploadedZip(upload);
    return NextResponse.json({ ok: true, staged });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  } finally {
    fs.rmSync(upload, { force: true });
  }
}
