import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { detectSystems } from "@/lib/scanner";

/** Inspect a root folder and propose system mappings for its subfolders */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { root } = await req.json().catch(() => ({}));
  if (typeof root !== "string" || !root.trim()) {
    return NextResponse.json({ error: "root path required" }, { status: 400 });
  }
  const { proposals, error } = detectSystems(root.trim());
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ proposals });
}
