import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import packageJson from "../../../../package.json";

/** Server identity for companion apps: public shape is name+version only;
 *  authenticated callers also get library totals. */
export async function GET() {
  const base = {
    name: "GameHub",
    version: (packageJson as { version?: string }).version ?? "0.0.0",
  };
  const user = await getSessionUser();
  if (!user) return NextResponse.json(base);

  const db = getDb();
  const games = (db.prepare("SELECT COUNT(*) c FROM roms WHERE missing = 0").get() as { c: number })
    .c;
  const platforms = (
    db
      .prepare("SELECT COUNT(DISTINCT platform_slug) c FROM roms WHERE missing = 0")
      .get() as { c: number }
  ).c;
  return NextResponse.json({ ...base, games, platforms, user: user.username, role: user.role });
}
