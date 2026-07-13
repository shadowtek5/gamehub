import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { streamBackupTar } from "@/lib/backup";

export const dynamic = "force-dynamic";

/** Download a backup of GameHub's data as a streaming .tar.
 *  ?saves=1&firmware=1&media=1&launchbox=1 select what's included —
 *  the database snapshot is always included. Admin only. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const q = req.nextUrl.searchParams;
  const on = (key: string) => q.get(key) === "1";
  const { stream, filename } = await streamBackupTar({
    saves: on("saves"),
    firmware: on("firmware"),
    media: on("media"),
    launchbox: on("launchbox"),
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-tar",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
