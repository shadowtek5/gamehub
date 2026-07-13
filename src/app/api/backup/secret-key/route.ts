import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getSessionUser } from "@/lib/auth";
import { secretKeyPath } from "@/lib/secretbox";

/** Status of the credential-encryption key, and (with ?download=1) the key file
 *  itself so an admin can stash it somewhere safe. The key is intentionally NOT
 *  part of backups, so this is the way to preserve it. Admin only. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const envKey = !!process.env.GAMEHUB_SECRET_KEY?.trim();
  const file = secretKeyPath();
  const filePresent = fs.existsSync(file);

  if (req.nextUrl.searchParams.get("download") === "1") {
    if (envKey && !filePresent) {
      return NextResponse.json(
        {
          error:
            "This install uses the GAMEHUB_SECRET_KEY environment variable — save that value in your secrets manager, there's no key file to download.",
        },
        { status: 400 }
      );
    }
    if (!filePresent) {
      return NextResponse.json({ error: "No key file found." }, { status: 404 });
    }
    const data = fs.readFileSync(file);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="gamehub-secret.key"',
        "Cache-Control": "no-store",
      },
    });
  }

  // env source takes precedence in the app, so report it even if a stale file exists
  return NextResponse.json({ source: envKey ? "env" : "file", filePresent });
}
