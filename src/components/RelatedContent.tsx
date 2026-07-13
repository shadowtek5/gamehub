// GAME DETAILS → "RELATED" tab. Content pulled from IGDB (the only provider
// that carries it). Laid out the way IGDB's own game page does: one labeled row
// per relationship kind (Part of / Same series / DLC / Expansions / Remakes /
// Remasters / Ports / Bundles / Mods …), then a "More like this" row of similar
// games, then external links. Rows are the same drag-scroll portrait-capsule
// shelves the library/home use (global ShelfScroll drives the drag; GameCover
// renders the cover with a gradient-title fallback).
//
// A game you OWN links straight to its page in GameHub; anything not in the
// library links out to its IGDB page. The current game is filtered out upstream.

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import GameCover from "@/components/GameCover";
import RelatedManager from "@/components/RelatedManager";
import type { IgdbRelatedResolved } from "@/lib/providers/igdb";
import type { CustomRelationRow } from "@/lib/db";

type RelatedGame = { name: string; cover?: string; url?: string; kind?: string; romId?: number };

// Edition `kind` → i18n key for the section title, in display order. Editions
// are split into one shelf per kind (IGDB-style) instead of one mixed "Related
// games" row. Kinds not listed here fall to the end under their own raw label.
const KIND_ORDER: [string, string][] = [
  ["Part of", "content.kindPartOf"],
  ["Series", "shared.sameSeries"],
  ["DLC", "content.kindDlc"],
  ["Expansion", "content.kindExpansion"],
  ["Expanded", "content.kindExpanded"],
  ["Standalone", "content.kindStandalone"],
  ["Remake", "content.kindRemake"],
  ["Remaster", "content.kindRemaster"],
  ["Port", "content.kindPort"],
  ["Bundle", "content.kindBundle"],
  ["Mod", "content.kindMod"],
];

async function Capsule({ game }: { game: RelatedGame }) {
  const t = await getTranslations("related");
  const owned = game.romId != null;
  const cover = (
    <span className="libraryassetimage_Container_gh appportrait_PortraitImage_gh relative block h-[258px] w-[172px] overflow-hidden rounded-[3px] bg-[#0e141b]">
      <GameCover title={game.name} boxartUrl={game.cover ?? null} className="h-full w-full" />
      {owned && (
        <span className="absolute bottom-1.5 right-1.5 rounded-[2px] bg-accent/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">
          {t("content.inLibrary")}
        </span>
      )}
    </span>
  );

  const cls =
    "gamecapsule_GameCapsule_gh appportrait_LibraryItemBox_gh appportrait_Portrait_gh deck-capsule deck-shimmer block w-[172px]";

  return (
    <div className="group relative shrink-0">
      {owned ? (
        <Link href={`/game/${game.romId}`} className={cls} title={t("content.openInLibrary", { name: game.name })}>
          {cover}
        </Link>
      ) : (
        <a href={game.url} target="_blank" rel="noreferrer" className={cls} title={t("content.onIgdb", { name: game.name })}>
          {cover}
        </a>
      )}
    </div>
  );
}

function Shelf({ title, games }: { title: string; games: RelatedGame[] }) {
  return (
    <section className="mb-9">
      <h2 className="gamepadhomerecommended_PlayNextCarouselTitle_gh mb-4 text-[22px] font-bold text-bright">
        {title}
      </h2>
      {/* Interior padding gives the hover/focus scale + outline room so the
          overflow-x scroller doesn't clip it (top/left/bottom); negative margins
          cancel it so the row still aligns to the section edges. */}
      <div className="no-scrollbar -mx-4 -my-4 flex gap-3 overflow-x-auto px-4 py-4">
        {games.map((g, i) => (
          <Capsule key={`${title}-${g.name}-${i}`} game={g} />
        ))}
      </div>
    </section>
  );
}

export default async function RelatedContent({
  related,
  romId,
  canManage = false,
  relations = [],
}: {
  related: IgdbRelatedResolved;
  /** the game being viewed — enables the editor "Manage related games" tool */
  romId?: number;
  canManage?: boolean;
  /** current custom relations, for the management modal */
  relations?: CustomRelationRow[];
}) {
  const t = await getTranslations("related");
  const { similar, editions, links } = related;
  const empty = !similar.length && !editions.length && !links.length;
  // Non-editors get nothing when there's nothing to show; editors always get the
  // tab so they can add the first custom relation.
  if (empty && !canManage) return null;
  const manager = canManage && romId != null ? <RelatedManager romId={romId} relations={relations} /> : null;

  // Group the editions by kind, then render them in KIND_ORDER (any unknown
  // kind trails at the end under its own label).
  const byKind = new Map<string, RelatedGame[]>();
  for (const e of editions) {
    const k = e.kind ?? "Related";
    const arr = byKind.get(k);
    if (arr) arr.push(e);
    else byKind.set(k, [e]);
  }
  const orderedKinds: [string, string][] = [
    ...KIND_ORDER.filter(([k]) => byKind.has(k)).map(([k, key]) => [k, t(key)] as [string, string]),
    ...[...byKind.keys()]
      .filter((k) => !KIND_ORDER.some(([kk]) => kk === k))
      .map((k) => [k, k] as [string, string]),
  ];

  return (
    <div>
      {manager}

      {orderedKinds.map(([k, title]) => (
        <Shelf key={k} title={title} games={byKind.get(k)!} />
      ))}

      {similar.length > 0 && <Shelf title={t("content.moreLikeThis")} games={similar} />}

      {links.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-[22px] font-bold text-bright">{t("content.links")}</h2>
          <div className="flex flex-wrap gap-2.5">
            {links.map((l, i) => (
              <a
                key={`${l.url}-${i}`}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="rounded bg-[#2a3540] px-4 py-2 text-[13px] font-semibold text-body transition-colors hover:bg-[#37434f] hover:text-bright"
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
      )}

      {empty ? (
        <div className="text-[13px] text-dim/80">
          {t("content.emptyState")}
        </div>
      ) : (
        <div className="text-[11px] text-dim/70">{t("content.attribution")}</div>
      )}
    </div>
  );
}
