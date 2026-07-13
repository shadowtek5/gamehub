import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth";
import { getDb, getSystemFolders } from "@/lib/db";

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function tag(el: string, name: string): string | undefined {
  const m = el.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeXml(m[1]).trim() || undefined : undefined;
}

/** Import ES-DE / EmulationStation gamelist.xml metadata from every mapped
 *  folder. Fill-gaps only: existing metadata is never overwritten. */
export async function POST() {
  const user = await getSessionUser();
  if (!user?.isEditor) {
    return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  }

  const db = getDb();
  let filesFound = 0;
  let gamesMatched = 0;
  let fieldsFilled = 0;
  const errors: string[] = [];

  const FIELDS: { xml: string; column: string; convert?: (v: string) => string }[] = [
    { xml: "desc", column: "description" },
    { xml: "developer", column: "developer" },
    { xml: "publisher", column: "publisher" },
    { xml: "genre", column: "genre" },
    { xml: "players", column: "players" },
    {
      xml: "rating",
      column: "rating",
      // ES ratings are 0..1 floats
      convert: (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 && n <= 1 ? `${Math.round(n * 10)}/10` : v;
      },
    },
    {
      xml: "releasedate",
      column: "release_date",
      // 19920821T000000 -> 1992-08-21
      convert: (v) =>
        /^\d{8}/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v,
    },
  ];

  for (const mapping of getSystemFolders()) {
    const xmlPath = path.join(mapping.path, "gamelist.xml");
    if (!fs.existsSync(xmlPath)) continue;
    filesFound++;
    let xml: string;
    try {
      xml = await fs.promises.readFile(xmlPath, "utf8");
    } catch (e) {
      errors.push(`${xmlPath}: ${e instanceof Error ? e.message : e}`);
      continue;
    }

    const findRom = db.prepare(
      "SELECT * FROM roms WHERE filename = ? AND platform_slug = ? AND path LIKE ?"
    );
    for (const gameMatch of xml.matchAll(/<game[^>]*>([\s\S]*?)<\/game>/gi)) {
      const el = gameMatch[1];
      const gamePath = tag(el, "path");
      if (!gamePath) continue;
      const filename = path.basename(gamePath.replace(/^\.\//, ""));
      const rom = findRom.get(filename, mapping.platform_slug, `${mapping.path}%`) as
        | Record<string, string | null>
        | undefined;
      if (!rom) continue;

      const sets: string[] = [];
      const values: string[] = [];
      for (const f of FIELDS) {
        if (rom[f.column]) continue; // fill gaps only
        const raw = tag(el, f.xml);
        if (!raw) continue;
        sets.push(`${f.column} = ?`);
        values.push(f.convert ? f.convert(raw) : raw);
      }
      if (sets.length > 0) {
        db.prepare(`UPDATE roms SET ${sets.join(", ")} WHERE id = ?`).run(...values, rom.id);
        gamesMatched++;
        fieldsFilled += sets.length;
      }
    }
  }

  return NextResponse.json({ ok: true, filesFound, gamesMatched, fieldsFilled, errors });
}
