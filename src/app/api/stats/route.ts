import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

/** Library + personal stats (RomM-style server stats) */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const games = (db.prepare("SELECT COUNT(*) c FROM roms WHERE missing = 0").get() as { c: number })
    .c;
  const scraped = (
    db
      .prepare("SELECT COUNT(*) c FROM roms WHERE missing = 0 AND scraped_at IS NOT NULL")
      .get() as { c: number }
  ).c;
  const hashed = (
    db.prepare("SELECT COUNT(*) c FROM roms WHERE missing = 0 AND md5 IS NOT NULL").get() as {
      c: number;
    }
  ).c;
  const missing = (db.prepare("SELECT COUNT(*) c FROM roms WHERE missing = 1").get() as { c: number })
    .c;
  const totalBytes = (
    db.prepare("SELECT COALESCE(SUM(size_bytes), 0) b FROM roms WHERE missing = 0").get() as {
      b: number;
    }
  ).b;
  const users = (db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c;
  const collections = (db.prepare("SELECT COUNT(*) c FROM collections").get() as { c: number }).c;
  const saveStates = (db.prepare("SELECT COUNT(*) c FROM save_states").get() as { c: number }).c;
  const platforms = db
    .prepare(
      "SELECT platform_slug AS slug, COUNT(*) AS games FROM roms WHERE missing = 0 GROUP BY platform_slug ORDER BY games DESC"
    )
    .all();
  const mine = db
    .prepare(
      `SELECT COALESCE(SUM(playtime_seconds), 0) AS playtime_seconds,
              COUNT(CASE WHEN favorite = 1 THEN 1 END) AS favorites,
              COUNT(CASE WHEN play_status = 'beaten' THEN 1 END) AS beaten
       FROM user_roms WHERE user_id = ?`
    )
    .get(user.id);

  return NextResponse.json({
    games,
    scraped,
    hashed,
    missing,
    totalBytes,
    users,
    collections,
    saveStates,
    platforms,
    me: mine,
  });
}
