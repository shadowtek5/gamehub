import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  compatSummary,
  getDb,
  getUserCompat,
  upsertCompatReport,
  deleteCompatReport,
  setCompatOfficial,
  isCompatRating,
} from "@/lib/db";
import { externalCompatFor } from "@/lib/compatLists";
import { fileSupportFor } from "@/lib/emulators";

// Emulation compatibility for a game.
// GET → the in-browser badge and reports, reports from emulators on devices, what the official
//   lists (RPCS3, Vita3K, PCSX2) say, which emulators can open the file, and the caller's own
//   report (?emulator=&device= for a device report; none = the in-browser player).
// POST { rating, note, emulator?, emulatorName?, device? } upserts the caller's report;
// POST { official } (admins) pins/clears the official in-browser rating.
// DELETE ?emulator=&device= removes the caller's report.

async function payload(userId: number, romId: number, emulator: string, device: string) {
  const rom = getDb().prepare("SELECT filename, platform_slug FROM roms WHERE id = ?").get(romId) as
    | { filename: string; platform_slug: string }
    | undefined;
  const [external, files] = await Promise.all([
    externalCompatFor(romId).catch(() => []),
    rom ? fileSupportFor(rom.platform_slug, rom.filename).catch(() => null) : Promise.resolve(null),
  ]);
  return { summary: compatSummary(romId), mine: getUserCompat(userId, romId, emulator, device) ?? null, external, files };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const q = req.nextUrl.searchParams;
  return NextResponse.json(await payload(user.id, Number(id), str(q.get("emulator"), 200), str(q.get("device"), 120)));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const romId = Number(id);
  const body = await req.json().catch(() => ({}));
  const emulator = str(body?.emulator, 200);
  const device = str(body?.device, 120);

  // Admin: pin/clear the official rating (official: rating | null).
  if ("official" in body) {
    if (!user.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });
    const off = body.official;
    if (off !== null && !isCompatRating(off)) {
      return NextResponse.json({ error: "official must be a rating or null" }, { status: 400 });
    }
    setCompatOfficial(romId, off);
  } else {
    if (!isCompatRating(body?.rating)) {
      return NextResponse.json({ error: "rating must be playable|runs|broken" }, { status: 400 });
    }
    const note = typeof body?.note === "string" ? body.note : null;
    upsertCompatReport(user.id, romId, body.rating, note, emulator, str(body?.emulatorName, 120) || null, device);
  }
  return NextResponse.json({ ok: true, ...(await payload(user.id, romId, emulator, device)) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const romId = Number(id);
  const q = req.nextUrl.searchParams;
  const emulator = str(q.get("emulator"), 200);
  const device = str(q.get("device"), 120);
  deleteCompatReport(user.id, romId, emulator, device);
  return NextResponse.json({ ok: true, ...(await payload(user.id, romId, emulator, device)) });
}
