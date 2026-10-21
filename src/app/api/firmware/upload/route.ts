import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import { getSessionUser } from "@/lib/auth";
import { platformBySlug } from "@/lib/platforms";
import { importFileFromDisk, importZip } from "@/lib/firmware";
import { matchPackage } from "@/lib/firmwarePackages";

export const dynamic = "force-dynamic";

/** Largest upload (Switch firmware zips are ~350 MB). */
const MAX_BYTES = 1024 * 1024 * 1024;

/**
 * Upload one firmware file as the raw request body (editor), streamed to disk so
 * large files never sit in memory. `?platform=<slug>&name=<file name>`.
 *  - System firmware / keys (PSVUPDAT.PUP, PS3UPDAT.PUP, prod.keys, a Switch
 *    firmware .zip or its .nca files…) are kept exactly as uploaded.
 *  - A BIOS file is matched by content hash, then by name.
 *  - Any other .zip is opened and every BIOS inside is filed (like POST /api/firmware).
 */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const p = req.nextUrl.searchParams;
  const slug = p.get("platform") ?? "";
  const name = path.basename(p.get("name") ?? "");
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (slug && !platformBySlug(slug)) return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return NextResponse.json({ error: "File too large (1 GB max)" }, { status: 400 });
  if (!req.body) return NextResponse.json({ error: "file required" }, { status: 400 });

  const tmp = path.join(os.tmpdir(), `gh-fw-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    let size = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        size += chunk.length;
        if (size > MAX_BYTES) cb(new Error("File too large (1 GB max)"));
        else cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(req.body as import("stream/web").ReadableStream), counter, fs.createWriteStream(tmp));
    if (size === 0) return NextResponse.json({ error: "file required" }, { status: 400 });

    // A zip that isn't a firmware package is a BIOS pack: open it and file what's inside.
    if (/\.zip$/i.test(name) && !(slug ? matchPackage(slug, name) : /firmware/i.test(name))) {
      if (size > 512 * 1024 * 1024) return NextResponse.json({ error: "BIOS zips are limited to 512 MB" }, { status: 400 });
      const result = await importZip(slug, await fs.promises.readFile(tmp));
      return NextResponse.json({ ok: true, zip: true, ...result });
    }
    const outcome = await importFileFromDisk(tmp, name, slug || null, true);
    if (outcome.status === "unmatched") {
      return NextResponse.json({ ok: false, error: `${name} isn't a BIOS or firmware file GameHub knows` }, { status: 400 });
    }
    return NextResponse.json({ ok: true, outcome });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Upload failed" }, { status: 400 });
  } finally {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
  }
}
