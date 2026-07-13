import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Proxy a deckthemes preview image (admin; keeps the browser off third-party hosts) */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Bad image id" }, { status: 400 });
  }
  const res = await fetch(`https://api.deckthemes.com/blobs/${id}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok || !res.body) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
