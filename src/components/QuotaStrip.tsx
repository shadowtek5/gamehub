"use client";

// Shared scrape-progress bits used by BOTH the desktop /downloads page and the
// (desktop + mobile) BulkScrape settings card, so the per-game sub-progress and
// the provider request-limit strip never drift between the two surfaces.

import { useTranslations } from "next-intl";

export interface ProviderQuota {
  provider: string;
  success: number;
  failed: number;
  used: number;
  total: number | null;
  window: "day" | "hour" | "second" | null;
  blocked: boolean;
  resetsAt: string | null;
  live: boolean;
  note: string;
  configured: boolean;
}

/** Live sub-progress of the game currently being scraped. */
export interface GameProgress {
  phase: string;
  mediaDone: number;
  mediaTotal: number;
  detail?: string;
}

const PROVIDER_NAMES: Record<string, string> = {
  screenscraper: "ScreenScraper",
  igdb: "IGDB",
  mobygames: "MobyGames",
  steamgriddb: "SteamGridDB",
  emumovies: "EmuMovies",
  launchbox: "LaunchBox",
};

function fmtReset(t: ReturnType<typeof useTranslations>, iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return t("soon");
  const min = Math.round(ms / 60000);
  if (min < 60) return `~${Math.max(1, min)}m`;
  return `~${Math.round(min / 60)}h`;
}

// Per-game scrape sub-progress → label + a 0..100 fill. Phases advance
// matching → metadata → media, with the media stage tracking art items
// downloaded + WebP-converted.
export function gamePhaseLabel(g: GameProgress): string {
  if (g.phase === "matching") return "Identifying game";
  if (g.phase === "metadata") return "Fetching metadata";
  return "Downloading & converting art";
}
export function gamePhasePct(g: GameProgress): number {
  if (g.phase === "matching") return 8;
  if (g.phase === "metadata") return 30;
  if (g.mediaTotal <= 0) return 100;
  return 35 + Math.round((65 * g.mediaDone) / g.mediaTotal);
}
export function gamePhaseRight(g: GameProgress): string {
  return g.phase === "media" && g.mediaTotal > 0 ? `${g.mediaDone} / ${g.mediaTotal} items` : "";
}

export function QuotaStrip({ quota }: { quota: ProviderQuota[] }) {
  const t = useTranslations("downloads.quota");
  if (quota.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-[3px] bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-widest text-dim">{t("providerRequestLimits")}</div>
      {quota.map((q) => {
        const name = PROVIDER_NAMES[q.provider] ?? q.provider;
        const win = q.window ? t(`window.${q.window}`) : "";
        const ratio = q.total ? Math.min(100, Math.round((q.used / q.total) * 100)) : 0;
        const near = q.total ? q.used >= q.total * 0.9 : false;
        return (
          <div key={q.provider} className={q.configured ? "" : "opacity-45"}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-white/85">
                {name}
                {q.live && <span className="ml-2 text-[10px] uppercase tracking-wide text-[#59bf40]">{t("live")}</span>}
                {q.blocked && (
                  <span className="ml-2 text-[11px] text-[#e0a23a]">
                    {t("skipping")}{q.resetsAt ? ` · ${t("backIn", { reset: fmtReset(t, q.resetsAt) })}` : ""}
                  </span>
                )}
              </span>
              {q.configured ? (
                <span className={`shrink-0 tabular-nums ${q.blocked || near ? "text-[#e0a23a]" : "text-dim"}`}>
                  <span className="text-[#59bf40]">{q.success.toLocaleString()}</span> {t("ok")}
                  {q.failed > 0 && <> · <span className="text-danger/80">{q.failed.toLocaleString()} {t("failed")}</span></>}
                  {q.total != null
                    ? ` / ${q.total.toLocaleString()}${win ? ` ${win}` : ""}`
                    : ` · ${q.used.toLocaleString()} ${t("requests")}`}
                </span>
              ) : (
                <span className="shrink-0 text-[12px] italic text-dim">{t("notSetUp")}</span>
              )}
            </div>
            {q.configured && q.total != null && (
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${q.blocked || near ? "bg-[#e0a23a]" : "bg-[#3a86ff]"}`}
                  style={{ width: `${ratio}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
