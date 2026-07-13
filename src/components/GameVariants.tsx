import Link from "next/link";
import { getTranslations } from "next-intl/server";
import GameCover from "./GameCover";
import type { GameVariant } from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";
import { LANGUAGE_NAMES } from "@/lib/language";

// Other versions of a game (regional releases, hacks, translations, extra
// discs) — the copies collapsed out of the browse grid. Shown on the game
// page's Variants tab.

const REGION_NAMES: Record<string, string> = {
  USA: "USA",
  U: "USA",
  EUROPE: "Europe",
  E: "Europe",
  JAPAN: "Japan",
  J: "Japan",
  WORLD: "World",
  JU: "Japan/USA",
  UE: "USA/Europe",
};
const VARIANT_NAMES: Record<string, string> = {
  hacks: "Hack",
  translations: "Translation",
  digital: "Digital",
  cia: "Digital",
};

function variantLabel(v: GameVariant): string {
  const parts: string[] = [];
  if (v.variant) parts.push(VARIANT_NAMES[v.variant] ?? v.variant);
  if (v.region) parts.push(REGION_NAMES[v.region.toUpperCase()] ?? v.region);
  const langs = (v.language ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((l) => LANGUAGE_NAMES[l] ?? l);
  if (langs.length) parts.push(langs.slice(0, 3).join(", "));
  if (v.disc_number) parts.push(`Disc ${v.disc_number}`);
  if (v.revision) parts.push(v.revision);
  return parts.join(" · ") || v.title;
}

export default async function GameVariants({
  variants,
  platformSlug,
}: {
  variants: GameVariant[];
  platformSlug: string;
}) {
  const t = await getTranslations("gameTabs");
  const platform = platformBySlug(platformSlug);
  return (
    <div>
      <p className="mb-4 text-[13px] text-dim">
        {t("variants.otherVersions", { system: platform?.name ?? t("variants.thisSystem") })}
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {variants.map((v) => (
          <Link
            key={v.id}
            href={`/game/${v.id}`}
            data-rom-id={v.id}
            className="deck-card group block"
            title={v.filename}
          >
            <div className="aspect-[3/4] w-full overflow-hidden rounded-[3px] bg-[#0e141b]">
              <GameCover
                title={v.title}
                boxartUrl={v.boxart_url}
                color={platform?.color}
                shortName={platform?.shortName}
                className="h-full w-full"
              />
            </div>
            <div className="mt-1.5 truncate text-[12px] font-semibold text-body">
              {variantLabel(v)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
