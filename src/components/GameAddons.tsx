import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { GameAddon } from "@/lib/addons";
import { formatBytes } from "@/lib/format";

// A game's DLC, updates and licenses (src/lib/addons.ts) — the files linked to it and left out of
// the library grids. Each downloads on its own, or all together as a .zip; a line says how the
// system's emulators take them.

const KIND_STYLE: Record<string, string> = {
  update: "bg-[#1a9fff]/20 text-[#66c0ff]",
  dlc: "bg-[#c08cff]/20 text-[#d4b0ff]",
  license: "bg-white/10 text-white/70",
};

/** The add-on's own name: "Mario Kart 8 Deluxe - Booster Course Pass" → "Booster Course Pass". */
function shortName(a: GameAddon, gameTitle: string): string {
  const own = (a.name ?? a.title).trim();
  const lower = own.toLowerCase();
  const base = gameTitle.toLowerCase();
  if (lower.startsWith(base) && own.length > base.length + 2) {
    return own.slice(base.length).replace(/^[\s:–—-]+/, "") || own;
  }
  return own;
}

export default async function GameAddons({
  romId,
  gameTitle,
  platformSlug,
  addons,
  mobile = false,
}: {
  romId: number;
  gameTitle: string;
  platformSlug: string;
  addons: GameAddon[];
  mobile?: boolean;
}) {
  if (!addons.length) return null;
  const t = await getTranslations("gameAddons");
  const downloadable = addons.filter((a) => a.size_bytes > 0);
  return (
    <section className={mobile ? "rounded-[10px] bg-[#1a1f27] p-3 ring-1 ring-white/5" : "border-t border-black/40 bg-[#0f1319] px-10 py-4"}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className={`font-bold uppercase tracking-wide text-dim ${mobile ? "text-[11px]" : "text-[12px]"}`}>
          {t("title")} · {addons.length}
        </h2>
        {downloadable.length > 1 && (
          <a
            href={`/api/roms/${romId}/addons?zip=1`}
            className="rounded bg-white/5 px-3 py-1 text-[13px] font-semibold text-body transition-colors hover:bg-white/10 hover:text-bright"
          >
            ⇩ {t("downloadAll")}
          </a>
        )}
      </div>
      <ul className={`mt-2 grid gap-1.5 ${mobile ? "" : "md:grid-cols-2"}`}>
        {addons.map((a) => (
          <li key={a.id} className="flex items-center gap-2.5 rounded-[3px] bg-black/20 px-3 py-2">
            <span className={`shrink-0 rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${KIND_STYLE[a.kind] ?? KIND_STYLE.license}`}>
              {t(`kind.${a.kind}`)}
            </span>
            <div className="min-w-0 flex-1">
              <Link href={mobile ? `/mobile/game/${a.id}` : `/game/${a.id}`} className="block truncate text-[14px] text-body hover:text-bright" title={a.filename}>
                {a.items?.length ? t("pack", { count: a.items.length }) : a.kind === "update" && a.version ? a.version : shortName(a, gameTitle)}
                {a.version && a.kind !== "update" && <span className="ml-1.5 text-dim">{a.version}</span>}
              </Link>
              {!!a.items?.length && (
                <div className="truncate text-[12px] text-dim" title={a.items.map((i) => i.name || i.id).join("\n")}>
                  {a.items.map((i) => i.name || i.id).join(" · ")}
                </div>
              )}
            </div>
            <span className="shrink-0 text-[12px] text-dim">{formatBytes(a.size_bytes)}</span>
            <a
              href={`/api/roms/${a.id}/file`}
              className="shrink-0 rounded bg-white/5 px-2 py-0.5 text-[13px] text-body transition-colors hover:bg-white/10 hover:text-bright"
              title={t("download")}
              aria-label={`${t("download")} ${a.filename}`}
            >
              ⇩
            </a>
          </li>
        ))}
      </ul>
      {t.has(`install.${platformSlug}`) && <p className="mt-2 text-[12px] text-dim">{t(`install.${platformSlug}`)}</p>}
    </section>
  );
}

/** On an add-on's own page: which game it belongs to. */
export async function AddonOf({ parent, mobile = false }: { parent: { id: number; title: string; kind: string }; mobile?: boolean }) {
  const t = await getTranslations("gameAddons");
  return (
    <div className={mobile ? "rounded-[10px] bg-[#1a1f27] px-3 py-2 text-[13px] text-dim ring-1 ring-white/5" : "border-t border-black/40 bg-[#0f1319] px-10 py-3 text-sm text-dim"}>
      {t.rich("partOf", {
        kind: t(`kind.${parent.kind}`),
        game: () => (
          <Link href={mobile ? `/mobile/game/${parent.id}` : `/game/${parent.id}`} className="font-semibold text-body hover:text-bright">
            {parent.title}
          </Link>
        ),
      })}
    </div>
  );
}
