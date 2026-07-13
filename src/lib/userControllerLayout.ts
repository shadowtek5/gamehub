// Server-side persistence for per-user emulator controller layouts.
//
// Stored in the existing per-user KV store (user_settings) under distinct keys
// per scope, so there's no schema change. Values are the JSON of a Layout
// (see src/lib/controllerLayout.ts). Not secret, so not sealed.

import { getUserSettings, setUserSetting, deleteUserSettings } from "./db";
import {
  sanitizeLayout,
  type ControllerFamily,
  type Layout,
} from "./controllerLayout";

// Every scope is keyed by controller family — a layout applies to a specific
// controller type (X-Input / PlayStation / Nintendo Pro / Generic), so the
// same game/system can carry different mappings per controller.
export type Scope =
  | { kind: "global"; family: ControllerFamily }
  | { kind: "system"; slug: string; family: ControllerFamily }
  | { kind: "game"; romId: number; family: ControllerFamily };

export function scopeKey(scope: Scope): string {
  switch (scope.kind) {
    case "global":
      return `emu_layout:global:${scope.family}`;
    case "system":
      return `emu_layout:system:${scope.slug}:${scope.family}`;
    case "game":
      return `emu_layout:game:${scope.romId}:${scope.family}`;
  }
}

function parse(value: string | undefined): Layout | null {
  if (!value) return null;
  try {
    return sanitizeLayout(JSON.parse(value));
  } catch {
    return null;
  }
}

export function getOverride(userId: number, scope: Scope): Layout | null {
  const settings = getUserSettings(userId);
  return parse(settings[scopeKey(scope)]);
}

export function setOverride(userId: number, scope: Scope, layout: unknown): Layout {
  const clean = sanitizeLayout(layout);
  setUserSetting(userId, scopeKey(scope), JSON.stringify(clean));
  return clean;
}

export function clearOverride(userId: number, scope: Scope): void {
  deleteUserSettings(userId, [scopeKey(scope)]);
}

/** All three override layers for a resolution context, in one settings read. */
export function getScopes(
  userId: number,
  ctx: { family: ControllerFamily; slug?: string | null; romId?: number | null }
): { global: Layout | null; system: Layout | null; game: Layout | null } {
  const settings = getUserSettings(userId);
  return {
    global: parse(settings[`emu_layout:global:${ctx.family}`]),
    system: ctx.slug ? parse(settings[`emu_layout:system:${ctx.slug}:${ctx.family}`]) : null,
    game: ctx.romId != null ? parse(settings[`emu_layout:game:${ctx.romId}:${ctx.family}`]) : null,
  };
}
