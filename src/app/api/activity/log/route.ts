import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  listEvents,
  eventCounts,
  clearEvents,
  purgeExpired,
  type EventCategory,
} from "@/lib/eventLog";

// Admin-only system Activity Log feed. Nested under /activity/log so it doesn't
// collide with the existing per-game /api/activity/[id] routes. Cursor by id:
//   ?since=<id>  → only newer rows (the live tail poll)
//   ?before=<id> → only older rows (load-older / infinite scroll)
// Every response also carries `counts` (per-category totals) for the filter chips.
export const dynamic = "force-dynamic";

const CATEGORIES = new Set<EventCategory>([
  "scan",
  "scrape",
  "user",
  "auth",
  "settings",
  "maintenance",
  "system",
]);

function intParam(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;

  // Opportunistically enforce the retention window whenever the log is viewed
  // (throttled internally), so old rows go even on low-traffic instances.
  purgeExpired();

  const sp = req.nextUrl.searchParams;
  const catRaw = sp.get("category");
  const category = catRaw && CATEGORIES.has(catRaw as EventCategory) ? (catRaw as EventCategory) : null;

  const events = listEvents({
    category,
    since: intParam(sp.get("since")),
    before: intParam(sp.get("before")),
    limit: intParam(sp.get("limit")) ?? 100,
  });
  return NextResponse.json({ events, counts: eventCounts() });
}

/** Clear log rows: ?all=1 wipes everything, ?olderThanDays=N keeps recent rows. */
export async function DELETE(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;

  const sp = req.nextUrl.searchParams;
  const days = intParam(sp.get("olderThanDays"));
  const all = sp.get("all") === "1";
  if (!all && (days == null || days <= 0)) {
    return NextResponse.json({ error: "Pass ?all=1 or ?olderThanDays=N" }, { status: 400 });
  }
  const deleted = clearEvents(all ? {} : { olderThanDays: days! });
  return NextResponse.json({ ok: true, deleted, counts: eventCounts() });
}
