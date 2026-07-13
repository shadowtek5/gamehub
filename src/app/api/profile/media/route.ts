import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

const TYPES: Record<string, string> = { avatar: "avatar_url", background: "background_url" };

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Upload the signed-in user's avatar or profile background */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const type = String(form?.get("type") ?? "");
  const file = form?.get("file");
  const column = TYPES[type];
  if (!column) return NextResponse.json({ error: "Unknown media type" }, { status: 400 });
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (20MB max)" }, { status: 400 });
  }
  const ext = EXT_BY_MIME[file.type.split(";")[0].trim()];
  if (!ext) return NextResponse.json({ error: "Use a PNG, JPG, WebP, or GIF image" }, { status: 400 });

  const dir = path.join(process.cwd(), "data", "media", "users", String(user.id));
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(
    path.join(dir, `${type}.${ext}`),
    Buffer.from(await file.arrayBuffer())
  );

  const url = `/api/media/users/${user.id}/${type}.${ext}?v=${Date.now()}`;
  getDb().prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(url, user.id);
  return NextResponse.json({ ok: true, url });
}
