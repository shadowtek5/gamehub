"use client";

// Global glue for per-card game options. Any focused/hovered game card can open
// its options via the footer Options chip or the gamepad Select button (both
// dispatch gh-game-options with the rom id). Mounted once in the layout so it
// works from every grid (library, system detail, home shelves) — it fetches the
// game's options payload on demand and opens the same GameOptionsModal the game
// page uses.

import { useEffect, useState } from "react";
import GameOptionsModal from "./GameOptionsModal";

interface GameOpts {
  romId: number;
  title: string;
  filename: string;
  favorite: boolean;
  hidden: boolean;
  heroPlain: boolean;
  hasManual: boolean;
  isAdmin: boolean;
  collections: { id: number; name: string; hasRom: boolean }[];
}

export default function GameCardMenu() {
  const [data, setData] = useState<GameOpts | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOptions = async (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (!id) return;
      try {
        const res = await fetch(`/api/roms/${id}/options`, { cache: "no-store" });
        if (!res.ok) return;
        setData(await res.json());
        setOpen(true);
      } catch {}
    };
    window.addEventListener("gh-game-options", onOptions);
    return () => window.removeEventListener("gh-game-options", onOptions);
  }, []);

  if (!data) return null;
  return (
    <GameOptionsModal
      key={data.romId} // fresh state per game
      romId={data.romId}
      title={data.title}
      filename={data.filename}
      favorite={data.favorite}
      hidden={data.hidden}
      heroPlain={data.heroPlain}
      hasManual={data.hasManual}
      isAdmin={data.isAdmin}
      collections={data.collections}
      hideTrigger
      open={open}
      onOpenChange={setOpen}
    />
  );
}
