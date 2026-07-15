import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  compatSummary,
  getUserCompat,
  upsertCompatReport,
  deleteCompatReport,
  setCompatOfficial,
  isCompatRating,
} from "@/lib/db";

// Emulation compatibility for a game. GET → aggregate + the caller's own report.
// POST { rating, note } upserts the caller's report; POST { official } (admins)
// pins/clears the official rating. DELETE removes the caller's report.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const romId = Number(id);
  return NextResponse.json({ summary: compatSummary(romId), mine: getUserCompat(user.id, romId) ?? null });
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
    upsertCompatReport(user.id, romId, body.rating, note);
  }
  return NextResponse.json({ ok: true, summary: compatSummary(romId), mine: getUserCompat(user.id, romId) ?? null });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const romId = Number(id);
  deleteCompatReport(user.id, romId);
  return NextResponse.json({ ok: true, summary: compatSummary(romId), mine: null });
}
