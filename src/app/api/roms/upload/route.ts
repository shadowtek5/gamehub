import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getSystemFolders } from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";
import { scanLibrary } from "@/lib/scanner";

/** Upload ROM files into a system's main mapped folder, then scan them in.
 *  Only ADDS files — existing ROMs are never overwritten. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isEditor) {
    return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const slug = String(form?.get("platform") ?? "");
  const platform = platformBySlug(slug);
  if (!platform) return NextResponse.json({ error: "Unknown platform" }, { status: 400 });

  const mapping = getSystemFolders().find(
    (f) => f.platform_slug === slug && f.variant === null
  );
  if (!mapping) {
    return NextResponse.json(
      { error: `No main folder is mapped for ${platform.name} — add one in Settings → Library` },
      { status: 400 }
    );
  }

  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "No files" }, { status: 400 });

  const saved: string[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const name = path.basename(file.name);
    if (file.size === 0 || file.size > 512 * 1024 * 1024) {
      errors.push(`${name}: empty or over 512MB`);
      continue;
    }
    const ext = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
    if (!ext || !platform.extensions.includes(ext)) {
      errors.push(`${name}: not a ${platform.shortName} file (${platform.extensions.join(" ")})`);
      continue;
    }
    const dest = path.join(mapping.path, name);
    if (fs.existsSync(dest)) {
      errors.push(`${name}: already exists`);
      continue;
    }
    try {
      await fs.promises.writeFile(dest, Buffer.from(await file.arrayBuffer()));
      saved.push(name);
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Pick the new files up right away
  let scan;
  if (saved.length > 0) scan = scanLibrary({ systems: [slug] });

  return NextResponse.json({ ok: saved.length > 0, saved, errors, scan });
}
