import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { auditCounts, getAuditJobStatus, startDatAudit } from "@/lib/audit";
import { datConfigured, datSlugsWithCoverage } from "@/lib/providers/datdb";
import { platformBySlug } from "@/lib/platforms";

function coveredSystems() {
  return datSlugsWithCoverage()
    .map((slug) => ({ slug, name: platformBySlug(slug)?.name ?? slug }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Set-integrity overview: DAT coverage, current verdict tallies, live job. */
export async function GET() {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  return NextResponse.json({
    datConfigured: datConfigured(),
    coveredSystems: coveredSystems(),
    counts: auditCounts(),
    job: getAuditJobStatus(),
  });
}

/** Start a background re-classify of hashed ROMs against the DAT DB. Runs in
 *  batches so it never blocks the server; poll GET for progress.
 *  Body: { systems?: string[] }. */
export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  if (!datConfigured()) {
    return NextResponse.json(
      { error: "No DAT database imported. Import DATs first (Settings › DAT database)." },
      { status: 400 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const systems: string[] | undefined = Array.isArray(body.systems)
    ? body.systems.filter((s: unknown) => typeof s === "string")
    : undefined;
  if (!startDatAudit(systems)) {
    return NextResponse.json(
      { error: "An audit is already running", job: getAuditJobStatus() },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, job: getAuditJobStatus() });
}
