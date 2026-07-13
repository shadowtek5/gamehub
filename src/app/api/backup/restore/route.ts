import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { getSessionUser } from "@/lib/auth";
import { restoreBackupTar } from "@/lib/backup";

export const dynamic = "force-dynamic";

/** True while any background job that writes the DB or media is running —
 *  restoring mid-job would corrupt its work. */
function jobRunning(): string | null {
  const g = globalThis as unknown as {
    __scrapeJob?: { running?: boolean };
    __hashJob?: { running?: boolean };
    __lbImport?: { running?: boolean };
  };
  if (g.__scrapeJob?.running) return "a scrape job";
  if (g.__hashJob?.running) return "the file-hashing job";
  if (g.__lbImport?.running) return "the LaunchBox import";
  return null;
}

/** Restore a GameHub backup (.tar, raw request body). Replaces the database
 *  (previous one kept as gamehub.db.pre-restore) and any folders contained
 *  in the backup. All sessions from before the restore become invalid —
 *  sign in again with an account from the backup. Admin only. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const busy = jobRunning();
  if (busy) {
    return NextResponse.json(
      { error: `Can't restore while ${busy} is running — wait for it to finish.` },
      { status: 409 }
    );
  }
  if (!req.body) return NextResponse.json({ error: "No backup uploaded" }, { status: 400 });

  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const upload = path.join(dataDir, `.restore-upload-${Date.now()}.tar`);

  try {
    await pipeline(
      Readable.fromWeb(req.body as import("stream/web").ReadableStream<Uint8Array>),
      fs.createWriteStream(upload)
    );
    const result = await restoreBackupTar(upload);
    return NextResponse.json({
      ok: true,
      restored: result.restored,
      files: result.files,
      backupCreatedAt: result.manifest.created_at,
      backupVersion: result.manifest.version,
      note: "All sessions were reset — sign in with an account from the backup.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Restore failed" },
      { status: 400 }
    );
  } finally {
    fs.rmSync(upload, { force: true });
  }
}
