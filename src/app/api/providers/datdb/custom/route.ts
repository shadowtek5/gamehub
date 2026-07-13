import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { importCustomDat, listCustomDats, removeCustomDat, datStatus } from "@/lib/providers/datdb";

const MAX_DAT_BYTES = 300 * 1024 * 1024;

/** List the user-uploaded custom DATs currently in the hash DB. */
export async function GET() {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  return NextResponse.json({ custom: listCustomDats() });
}

/** Upload one or more .dat files (multipart, field "dat"); each is parsed into
 *  the hash DB tagged custom so it survives libretro re-imports. */
export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected a multipart upload" }, { status: 400 });
  const files = form.getAll("dat").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "No .dat file provided" }, { status: 400 });

  const imported: { label: string; games: number; entries: number }[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (!/\.dat$/i.test(file.name)) {
      errors.push(`${file.name}: not a .dat file`);
      continue;
    }
    if (file.size > MAX_DAT_BYTES) {
      errors.push(`${file.name}: too large (max 300 MB)`);
      continue;
    }
    try {
      const text = await file.text();
      const res = importCustomDat(file.name, text);
      if (res.games === 0) errors.push(`${file.name}: no games parsed (not a clrmamepro DAT?)`);
      else imported.push({ label: file.name.replace(/\.dat$/i, ""), ...res });
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return NextResponse.json({ ok: imported.length > 0, imported, errors, status: datStatus() });
}

/** Remove a custom DAT by its label: ?label=… */
export async function DELETE(req: NextRequest) {
  const g = await requireAdmin();
  if (g instanceof NextResponse) return g;
  const label = req.nextUrl.searchParams.get("label");
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });
  const removed = removeCustomDat(label);
  return NextResponse.json({ ok: true, removed, status: datStatus() });
}
