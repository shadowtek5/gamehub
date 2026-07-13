import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { allEvents, RETENTION_DAYS } from "@/lib/eventLog";

// Admin-only JSON backup of the whole Activity Log. Served as a file download so
// the client can grab it with a plain link. Timestamp is added by the client
// filename; here we just stream the attachment.
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;

  const events = allEvents();
  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      retentionDays: RETENTION_DAYS,
      count: events.length,
      events,
    },
    null,
    2
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="gamehub-activity-log.json"`,
      "Cache-Control": "no-store",
    },
  });
}
