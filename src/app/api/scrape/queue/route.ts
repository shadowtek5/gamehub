import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, getHiddenSystems } from "@/lib/db";

/**
 * List rom ids to scrape.
 * ?onlyMissing=1 skips already-scraped games; ?systems=snes,gba restricts
 * to specific systems. Hidden systems are always excluded.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const onlyMissing = req.nextUrl.searchParams.get("onlyMissing") === "1";
  const systemsParam = req.nextUrl.searchParams.get("systems");
  const systems = systemsParam ? systemsParam.split(",").filter(Boolean) : null;
  const hidden = [...getHiddenSystems()];

  const clauses = ["missing = 0", "(disc_number IS NULL OR disc_number = 1)"];
  const params: string[] = [];
  if (onlyMissing) clauses.push("scraped_at IS NULL");
  if (systems?.length) {
    clauses.push(`platform_slug IN (${systems.map(() => "?").join(",")})`);
    params.push(...systems);
  }
  if (hidden.length) {
    clauses.push(`platform_slug NOT IN (${hidden.map(() => "?").join(",")})`);
    params.push(...hidden);
  }

  const rows = getDb()
    .prepare(`SELECT id FROM roms WHERE ${clauses.join(" AND ")} ORDER BY sort_title`)
    .all(...params) as { id: number }[];
  return NextResponse.json({ ids: rows.map((r) => r.id) });
}
