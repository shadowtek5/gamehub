import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { GameAddon } from "@/lib/addons";
import { formatBytes } from "@/lib/format";

// A game's DLC, updates and licenses (src/lib/addons.ts) — the files linked to it and left out of
// the library grids. The game page's DLC tab (a section on mobile): updates, then DLC — a pack (one
// file holding several, e.g. a PS Vita DLC pack) lists every DLC inside — then licenses. Each file
// downloads on its own, or all together as a .zip; a line says how the system's emulators take them.

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

function Kind({ kind, label }: { kind: string; label: string }) {
  return (
    <span className={`shrink-0 rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${KIND_STYLE[kind] ?? KIND_STYLE.license}`}>
      {label}
    </span>
  );
}

function DownloadButton({ id, label, text }: { id: number; label: string; text?: string }) {
  return (
    <a
      href={`/api/roms/${id}/file`}
      className="shrink-0 rounded bg-white/5 px-2.5 py-1 text-[13px] text-body transition-colors hover:bg-white/10 hover:text-bright"
      title={label}
      aria-label={label}
    >
      ⇩{text ? ` ${text}` : ""}
    </a>
  );
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
  const updates = addons.filter((a) => a.kind === "update");
  const dlcs = addons.filter((a) => a.kind === "dlc");
  const singles = dlcs.filter((a) => !a.items?.length);
  const packs = dlcs.filter((a) => a.items?.length);
  const licenses = addons.filter((a) => a.kind === "license");
  const dlcCount = dlcs.reduce((n, a) => n + (a.items?.length || 1), 0);
  const downloadable = addons.filter((a) => a.size_bytes > 0);
  const pageOf = (id: number) => (mobile ? `/mobile/game/${id}` : `/game/${id}`);
  const row = "flex items-center gap-3 rounded-[3px] bg-black/20 px-3 py-2.5";
  const heading = "mb-2 text-[12px] font-bold uppercase tracking-wider text-dim";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-dim">
          {[
            dlcCount ? t("countDlc", { count: dlcCount }) : null,
            updates.length ? t("countUpdates", { count: updates.length }) : null,
            licenses.length ? t("countLicenses", { count: licenses.length }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {downloadable.length > 1 && (
          <a
            href={`/api/roms/${romId}/addons?zip=1`}
            className="rounded bg-white/5 px-3 py-1 text-[13px] font-semibold text-body transition-colors hover:bg-white/10 hover:text-bright"
          >
            ⇩ {t("downloadAll")}
          </a>
        )}
      </div>
      {t.has(`install.${platformSlug}`) && <p className="mt-1 text-[12px] text-dim">{t(`install.${platformSlug}`)}</p>}

      <div className="mt-4 space-y-5">
        {updates.length > 0 && (
          <section>
            <h3 className={heading}>{t("updatesTitle")}</h3>
            <ul className="grid gap-1.5">
              {updates.map((a) => (
                <li key={a.id} className={row}>
                  <Kind kind="update" label={t("kind.update")} />
                  <Link href={pageOf(a.id)} className="min-w-0 flex-1 truncate text-[14px] text-body hover:text-bright" title={a.filename}>
                    {a.version ?? shortName(a, gameTitle)}
                    <span className="ml-2 text-[12px] text-dim">{a.filename}</span>
                  </Link>
                  <span className="shrink-0 text-[12px] text-dim">{formatBytes(a.size_bytes)}</span>
                  <DownloadButton id={a.id} label={`${t("download")} ${a.filename}`} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {dlcs.length > 0 && (
          <section>
            <h3 className={heading}>
              {t("dlcTitle")} · {dlcCount}
            </h3>
            <div className="grid gap-3">
              {singles.length > 0 && (
                <ul className={`grid gap-1.5 ${mobile ? "" : "md:grid-cols-2"}`}>
                  {singles.map((a) => (
                    <li key={a.id} className={row}>
                      <Kind kind="dlc" label={t("kind.dlc")} />
                      <div className="min-w-0 flex-1">
                        <Link href={pageOf(a.id)} className="block truncate text-[14px] text-body hover:text-bright" title={a.filename}>
                          {shortName(a, gameTitle)}
                        </Link>
                        {a.addon_id && <div className="truncate font-mono text-[11px] text-dim">{a.addon_id}</div>}
                      </div>
                      <span className="shrink-0 text-[12px] text-dim">{formatBytes(a.size_bytes)}</span>
                      <DownloadButton id={a.id} label={`${t("download")} ${a.filename}`} />
                    </li>
                  ))}
                </ul>
              )}
              {/* Packs: one file, every DLC inside listed */}
              {packs.map((a) => (
                <div key={a.id} className="overflow-hidden rounded-[4px] ring-1 ring-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-3 bg-black/30 px-3 py-2.5">
                    <Kind kind="dlc" label={t("pack", { count: a.items!.length })} />
                    <Link href={pageOf(a.id)} className="min-w-0 flex-1 truncate text-[13px] text-dim hover:text-bright" title={a.filename}>
                      {a.filename}
                    </Link>
                    <span className="shrink-0 text-[12px] text-dim">{formatBytes(a.size_bytes)}</span>
                    <DownloadButton id={a.id} label={`${t("download")} ${a.filename}`} text={t("downloadPack")} />
                  </div>
                  <ol className={`grid bg-[#12161d] ${mobile ? "" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
                    {a.items!.map((i, n) => (
                      <li key={`${i.id}-${n}`} className="flex min-w-0 items-baseline gap-2.5 border-t border-white/[0.04] px-3 py-2">
                        <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-dim">{n + 1}</span>
                        <div className="min-w-0">
                          <div className="truncate text-[14px] text-body" title={i.name || i.id}>
                            {i.name || i.id}
                          </div>
                          {i.name && i.id && <div className="truncate font-mono text-[11px] text-dim">{i.id}</div>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        )}

        {licenses.length > 0 && (
          <section>
            <h3 className={heading}>{t("licensesTitle")}</h3>
            <ul className={`grid gap-1.5 ${mobile ? "" : "md:grid-cols-2"}`}>
              {licenses.map((a) => (
                <li key={a.id} className={row}>
                  <Kind kind="license" label={t("kind.license")} />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-body" title={a.filename}>
                    {shortName(a, gameTitle)}
                  </span>
                  <DownloadButton id={a.id} label={`${t("download")} ${a.filename}`} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
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
