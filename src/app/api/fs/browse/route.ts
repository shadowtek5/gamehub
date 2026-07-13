import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth";

/** Browse the server's folders (admin) — backs the 📁 pickers next to path
 *  inputs. Directories only; nothing is ever read or written. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const raw = req.nextUrl.searchParams.get("path")?.trim() ?? "";

  // No path: list the roots (drive letters on Windows, / elsewhere)
  if (!raw) {
    if (process.platform === "win32") {
      const drives: { name: string; path: string }[] = [];
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        try {
          if (fs.existsSync(`${letter}:\\`)) {
            drives.push({ name: `${letter}:\\`, path: `${letter}:\\` });
          }
        } catch {}
      }
      return NextResponse.json({ path: "", parent: null, dirs: drives, roots: true, platform: "win32" });
    }
    return NextResponse.json({
      path: "",
      parent: null,
      dirs: [{ name: "/", path: "/" }],
      roots: true,
      platform: process.platform,
    });
  }

  // Inside a Linux container, UNC paths can't be reached — shares must be
  // mounted as volumes (see docker-compose.yml)
  if (process.platform !== "win32" && raw.startsWith("\\\\")) {
    return NextResponse.json(
      {
        error:
          "SMB paths (\\\\nas\\share) aren't reachable from inside the container — mount the share as a Docker volume (e.g. at /roms) and browse that instead.",
      },
      { status: 400 }
    );
  }

  const current = path.resolve(raw);
  let entries: fs.Dirent[];
  try {
    const stat = await fs.promises.stat(current);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Not a folder" }, { status: 400 });
    }
    entries = await fs.promises.readdir(current, { withFileTypes: true });
  } catch (e) {
    return NextResponse.json(
      { error: `Can't open that folder: ${e instanceof Error ? e.message : e}` },
      { status: 400 }
    );
  }

  const dirs = entries
    .filter((e) => {
      try {
        return e.isDirectory() || (e.isSymbolicLink() && fs.statSync(path.join(current, e.name)).isDirectory());
      } catch {
        return false;
      }
    })
    .map((e) => ({ name: e.name, path: path.join(current, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  // Parent: dirname, until we hit a root (dirname of a root is itself);
  // then "" = the drive list. UNC share roots also step back to "".
  const dirname = path.dirname(current);
  const parent = dirname === current ? "" : dirname;

  return NextResponse.json({ path: current, parent, dirs, roots: false, platform: process.platform });
}
