import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { playSummary } from "@/lib/playSummary";

/** The signed-in user's personal play breakdown (time, completion, top games,
 *  time by system, favourite genres) — the profile "Year in Review" section. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(playSummary(user.id));
}
