import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { REPORT_META, isReportId, runReport } from "@/lib/report";

// Library management reports (admin only).
//  - GET                    → the list of available reports (picker metadata)
//  - GET ?type=<id>         → run that single report
//  - GET ?type=<id>&format=json → download that report as JSON
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const type = req.nextUrl.searchParams.get("type");
  if (!type) {
    return NextResponse.json({ reports: REPORT_META });
  }
  if (!isReportId(type)) {
    return NextResponse.json({ error: "Unknown report" }, { status: 400 });
  }

  const report = runReport(type);

  if (req.nextUrl.searchParams.get("format") === "json") {
    return new NextResponse(JSON.stringify(report, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="gamehub-${type}-${report.generatedAt.slice(0, 10)}.json"`,
      },
    });
  }

  return NextResponse.json(report);
}
