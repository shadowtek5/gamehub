import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getDataDir } from "@/lib/dataDir";
import {
  deviceSaveFile,
  deviceSaveKeyError,
  deviceSaveRow,
  preconditionFailure,
  versionHeaders,
} from "@/lib/saveSync";

// A device save: one emulator save folder (PSP SAVEDATA for a game id, a Vita
// or 3DS title's save data, a DS .sav…) synced from a client device as a zip.
//   GET     download the zip (ETag / X-Save-Sha256 / X-Save-Updated-At)
//   POST    upload a zip body; X-Save-Sha256 = the client's hash of the save's
//           contents (required). Optional X-Save-Title, X-Save-Rom-Id,
//           X-Save-Device (URI-encoded). Conditional with If-Match / If-None-Match.
//   DELETE  remove it

export const dynamic = "force-dynamic";

const MAX_BYTES = 512 * 1024 * 1024;

type Params = { params: Promise<{ platform: string; key: string }> };

async function resolve(params: Params["params"]) {
  const p = await params;
  // Route params arrive decoded; decode again only if a client double-encoded.
  const key = /%[0-9A-Fa-f]{2}/.test(p.key) ? safeDecode(p.key) : p.key;
  return { platform: p.platform.toLowerCase(), key };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Links a device save to a library game when the client didn't say which: a save id
 * that appears in a ROM's file name (Vita "PCSE01168", PSP "ULUS10336"), a ROM whose
 * base name is the key (DS .sav files), or a game with the same title.
 */
function guessRom(platform: string, key: string, title: string | null): number | null {
  const rows = getDb()
    .prepare("SELECT id, filename, title FROM roms WHERE missing = 0 AND platform_slug = ?")
    .all(platform) as { id: number; filename: string; title: string }[];
  const k = key.toLowerCase();
  const base = (f: string) => (f.lastIndexOf(".") > 0 ? f.slice(0, f.lastIndexOf(".")) : f).toLowerCase();
  const byId = /^[a-z]{4}\d{5}$/.test(k) ? rows.find((r) => r.filename.toLowerCase().includes(k)) : undefined;
  const byName = rows.find((r) => base(r.filename) === k);
  const t = title ? norm(title) : "";
  const byTitle = t ? rows.find((r) => norm(r.title) === t) : undefined;
  return (byId ?? byName ?? byTitle)?.id ?? null;
}

function header(req: NextRequest, name: string): string | null {
  const v = req.headers.get(name);
  return v ? safeDecode(v).trim() || null : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { platform, key } = await resolve(params);
  const bad = deviceSaveKeyError(platform, key);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const row = deviceSaveRow(user.id, platform, key);
  const file = row ? path.join(getDataDir(), row.savePath) : null;
  if (!row || !file || !fs.existsSync(file)) return NextResponse.json({ error: "No save" }, { status: 404 });
  const buf = await fs.promises.readFile(file);
  const name = `${platform}-${key}`.replace(/[^A-Za-z0-9._-]+/g, "_");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      ...versionHeaders(row),
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}.zip"`,
      "Content-Length": String(buf.length),
    },
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { platform, key } = await resolve(params);
  const bad = deviceSaveKeyError(platform, key);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const hash = (req.headers.get("x-save-sha256") ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    return NextResponse.json({ error: "X-Save-Sha256 (hex SHA-256 of the save contents) required" }, { status: 400 });
  }
  const current = deviceSaveRow(user.id, platform, key);
  const failed = preconditionFailure(req.headers, current?.sha256 ?? null);
  if (failed) {
    // savePath is server-internal; undefined fields are dropped from the JSON.
    return NextResponse.json({ error: failed, current: current ? { ...current, savePath: undefined } : null }, { status: 412 });
  }

  const data = Buffer.from(await req.arrayBuffer());
  if (data.length === 0) return NextResponse.json({ error: "Empty save" }, { status: 400 });
  if (data.length > MAX_BYTES) return NextResponse.json({ error: "Save too large (512MB max)" }, { status: 400 });
  if (data[0] !== 0x50 || data[1] !== 0x4b) return NextResponse.json({ error: "Body must be a zip" }, { status: 400 });

  const romIdRaw = Number(req.headers.get("x-save-rom-id"));
  const title = header(req, "x-save-title")?.slice(0, 200) ?? null;
  const device = header(req, "x-save-device")?.slice(0, 100) ?? null;
  const romId =
    Number.isInteger(romIdRaw) && romIdRaw > 0 && getDb().prepare("SELECT 1 FROM roms WHERE id = ?").get(romIdRaw)
      ? romIdRaw
      : current?.romId ?? guessRom(platform, key, title);

  const file = deviceSaveFile(user.id, platform, key);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, data);
  await fs.promises.rename(tmp, file);

  getDb()
    .prepare(
      `INSERT INTO device_saves (user_id, platform, save_key, rom_id, title, device, sha256, size_bytes, save_path, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, platform, save_key) DO UPDATE SET
         rom_id = COALESCE(excluded.rom_id, device_saves.rom_id),
         title = COALESCE(excluded.title, device_saves.title),
         device = COALESCE(excluded.device, device_saves.device),
         sha256 = excluded.sha256, size_bytes = excluded.size_bytes,
         save_path = excluded.save_path, updated_at = datetime('now')`
    )
    .run(user.id, platform, key, romId, title, device, hash, data.length, path.relative(getDataDir(), file));

  const saved = deviceSaveRow(user.id, platform, key);
  return NextResponse.json({
    ok: true,
    platform,
    key,
    romId: saved?.romId ?? null,
    sha256: hash,
    size: data.length,
    updatedAt: saved?.updatedAt ?? null,
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { platform, key } = await resolve(params);
  const bad = deviceSaveKeyError(platform, key);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const row = deviceSaveRow(user.id, platform, key);
  getDb().prepare("DELETE FROM device_saves WHERE user_id = ? AND platform = ? AND save_key = ?").run(user.id, platform, key);
  if (row) await fs.promises.rm(path.join(getDataDir(), row.savePath), { force: true }).catch(() => {});
  return NextResponse.json({ ok: true });
}
