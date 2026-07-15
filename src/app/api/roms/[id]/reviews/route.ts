import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  reviewSummary,
  listReviews,
  getUserReview,
  upsertReview,
  deleteReview,
} from "@/lib/db";

// Community reviews for a game: a thumbs up/down recommendation + optional text,
// one per user. GET returns the aggregate, everyone's reviews, and the caller's
// own. POST upserts the caller's; DELETE removes it.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const romId = Number(id);
  return NextResponse.json({
    summary: reviewSummary(romId),
    reviews: listReviews(romId),
    mine: getUserReview(user.id, romId) ?? null,
  });
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
  if (typeof body?.recommended !== "boolean") {
    return NextResponse.json({ error: "recommended (boolean) required" }, { status: 400 });
  }
  const text = typeof body?.body === "string" ? body.body : null;
  upsertReview(user.id, romId, body.recommended, text);
  return NextResponse.json({
    ok: true,
    summary: reviewSummary(romId),
    reviews: listReviews(romId),
    mine: getUserReview(user.id, romId) ?? null,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const romId = Number(id);
  deleteReview(user.id, romId);
  return NextResponse.json({
    ok: true,
    summary: reviewSummary(romId),
    reviews: listReviews(romId),
    mine: null,
  });
}
