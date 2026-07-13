"use client";

// Browse-page glue for per-card system options: opens the focused system's cog
// menu — the same SystemTools menu as the detail page — when Options fires
// (footer chip or the gamepad Select button, via gh-system-options). The footer
// itself tracks which card is focused/hovered to show the chips.

import { useEffect, useMemo, useState } from "react";
import SystemTools from "./SystemTools";

export interface SystemMenuInfo {
  slug: string;
  shortName: string;
  color: string;
  covers: string[];
  heroSource: "ribbon" | "image";
}

export default function SystemsCardMenu({ systems }: { systems: SystemMenuInfo[] }) {
  const bySlug = useMemo(
    () => new Map<string, SystemMenuInfo>(systems.map((s) => [s.slug, s])),
    [systems]
  );

  const [menuSlug, setMenuSlug] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Open the cog menu for a system (footer Options chip or gamepad Select).
  useEffect(() => {
    const onOptions = (e: Event) => {
      const slug = (e as CustomEvent<string>).detail;
      if (slug && bySlug.has(slug)) {
        setMenuSlug(slug);
        setMenuOpen(true);
      }
    };
    window.addEventListener("gh-system-options", onOptions);
    return () => window.removeEventListener("gh-system-options", onOptions);
  }, [bySlug]);

  const info = menuSlug ? bySlug.get(menuSlug) : null;
  if (!info) return null;
  return (
    <SystemTools
      slug={info.slug}
      shortName={info.shortName}
      color={info.color}
      covers={info.covers}
      heroSource={info.heroSource}
      hideTrigger
      open={menuOpen}
      onOpenChange={setMenuOpen}
    />
  );
}
