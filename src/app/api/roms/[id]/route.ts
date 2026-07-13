import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import fs from "fs";
import path from "path";
import { getDb, getLibraryRom, RomRow } from "@/lib/db";
import { platformBySlug, platformPlayable } from "@/lib/platforms";
import { sortTitle } from "@/lib/scanner";

/** Read one game, including the caller's personal data */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const rom = getLibraryRom(user.id, Number(id));
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const platform = platformBySlug(rom.platform_slug);
  return NextResponse.json({
    rom: {
      ...rom,
      playable: platform ? platformPlayable(platform) : false,
      platform_name: platform?.name ?? rom.platform_slug,
      file_url: `/api/roms/${rom.id}/file`,
    },
  });
}

/** Edit ROM metadata (admin only): title, platform, region, box art */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isEditor) return NextResponse.json({ error: "Editor access required" }, { status: 403 });

  const { id } = await params;
  const rom = getDb().prepare("SELECT * FROM roms WHERE id = ?").get(Number(id)) as
    | RomRow
    | undefined;
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  const title =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : rom.title;

  let platformSlug = rom.platform_slug;
  if (typeof body.platform_slug === "string") {
    if (!platformBySlug(body.platform_slug)) {
      return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
    }
    platformSlug = body.platform_slug;
  }

  const region =
    body.region === null
      ? null
      : typeof body.region === "string"
        ? body.region.trim().toUpperCase() || null
        : rom.region;

  const boxartUrl =
    body.boxart_url === null
      ? null
      : typeof body.boxart_url === "string"
        ? body.boxart_url.trim() || null
        : rom.boxart_url;

  const description =
    body.description === null
      ? null
      : typeof body.description === "string"
        ? body.description.trim() || null
        : rom.description;

  const optionalText = (value: unknown, current: string | null) =>
    value === null ? null : typeof value === "string" ? value.trim() || null : current;
  const heroUrl = optionalText(body.hero_url, rom.hero_url);
  const iconUrl = optionalText(body.icon_url, rom.icon_url);
  const developer = optionalText(body.developer, rom.developer);
  const publisher = optionalText(body.publisher, rom.publisher);
  const genre = optionalText(body.genre, rom.genre);
  const players = optionalText(body.players, rom.players);
  const rating = optionalText(body.rating, rom.rating);
  const releaseDate = optionalText(body.release_date, rom.release_date);
  const language = optionalText(body.language, rom.language);

  getDb()
    .prepare(
      `UPDATE roms SET title = ?, sort_title = ?, platform_slug = ?, region = ?, boxart_url = ?, hero_url = ?, icon_url = ?, description = ?,
       developer = ?, publisher = ?, genre = ?, players = ?, rating = ?, release_date = ?, language = ?
       WHERE id = ?`
    )
    .run(
      title,
      sortTitle(title),
      platformSlug,
      region,
      boxartUrl,
      heroUrl,
      iconUrl,
      description,
      developer,
      publisher,
      genre,
      players,
      rating,
      releaseDate,
      language,
      rom.id
    );

  return NextResponse.json({ ok: true });
}

/** Remove a game from the library (admin). Body { deleteFile: true } also
 *  permanently deletes the ROM file from disk. Without it, the entry
 *  reappears on the next scan (the file is untouched). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await params;
  const rom = getDb().prepare("SELECT * FROM roms WHERE id = ?").get(Number(id)) as
    | RomRow
    | undefined;
  if (!rom) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  let fileDeleted = false;
  if (body.deleteFile === true) {
    try {
      await fs.promises.rm(rom.path, { force: true });
      fileDeleted = true;
    } catch (e) {
      return NextResponse.json(
        { error: `Could not delete the file: ${e instanceof Error ? e.message : e}` },
        { status: 500 }
      );
    }
  }

  // Row + favorites/collection entries/save states cascade; media folder too
  getDb().prepare("DELETE FROM roms WHERE id = ?").run(rom.id);
  try {
    fs.rmSync(path.join(process.cwd(), "data", "media", String(rom.id)), {
      recursive: true,
      force: true,
    });
  } catch {}

  return NextResponse.json({ ok: true, fileDeleted });
}
