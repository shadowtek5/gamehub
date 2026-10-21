import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { EMULATOR_BIOS, getEmulatorCatalog } from "@/lib/emulators";

/** Android emulators per system (from Cocoon FE's platform definitions, cached),
 *  with how to launch a game in each and where standalone emulators keep BIOS
 *  files. `?platform=<slug>` limits it to one system; `?refresh=1` re-downloads
 *  the definitions (admins only). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const slug = p.get("platform");
  const catalog = await getEmulatorCatalog({ force: p.get("refresh") === "1" && user.isAdmin });
  const platforms = slug ? { [slug]: catalog.platforms[slug] ?? [] } : catalog.platforms;
  const bios = slug ? EMULATOR_BIOS.filter((e) => e.platforms.includes(slug)) : EMULATOR_BIOS;
  return NextResponse.json({ source: catalog.source, platforms, bios });
}
