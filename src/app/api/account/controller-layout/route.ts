import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getScopes,
  getOverride,
  setOverride,
  clearOverride,
  type Scope,
} from "@/lib/userControllerLayout";
import { resolveLayout, type ControllerFamily } from "@/lib/controllerLayout";

// Per-user emulator controller layouts (global-per-family / per-system /
// per-game). GET resolves the effective layout for a play context; PUT saves
// one scope's override; DELETE clears it (reset-to-inherit).

const FAMILIES: ControllerFamily[] = ["xinput", "playstation", "nintendo", "generic"];
function asFamily(v: string | null | undefined): ControllerFamily {
  return FAMILIES.includes(v as ControllerFamily) ? (v as ControllerFamily) : "xinput";
}

/** Build a Scope from loose fields, or null if the identifiers are missing.
 *  Every scope is family-keyed. */
function toScope(kind: unknown, family: string | null, slug: string | null, romId: string | null): Scope | null {
  const fam = asFamily(family);
  if (kind === "global") return { kind: "global", family: fam };
  if (kind === "system" && slug) return { kind: "system", slug, family: fam };
  if (kind === "game" && romId && Number.isFinite(Number(romId))) {
    return { kind: "game", romId: Number(romId), family: fam };
  }
  return null;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const family = asFamily(q.get("family"));
  const slug = q.get("slug");
  const romId = q.get("romId");
  const overrides = getScopes(user.id, {
    family,
    slug,
    romId: romId ? Number(romId) : null,
  });
  const { layout, source } = resolveLayout(overrides, family);
  return NextResponse.json({ family, overrides, resolved: layout, source });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const scope = toScope(
    body?.scope,
    body?.family ?? null,
    body?.slug ?? null,
    body?.romId != null ? String(body.romId) : null
  );
  if (!scope) return NextResponse.json({ error: "Invalid scope" }, { status: 400 });

  const saved = setOverride(user.id, scope, body?.layout);
  return NextResponse.json({ ok: true, layout: saved });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const scope = toScope(q.get("scope"), q.get("family"), q.get("slug"), q.get("romId"));
  if (!scope) return NextResponse.json({ error: "Invalid scope" }, { status: 400 });

  clearOverride(user.id, scope);
  // Return the freshly-cleared scope so the client can confirm it's gone.
  return NextResponse.json({ ok: true, override: getOverride(user.id, scope) });
}
