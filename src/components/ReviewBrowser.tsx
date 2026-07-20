"use client";

// Library review / cleanup browser. Two tabs:
//   • Unidentified — games whose hash isn't in any DAT (unknown) or matched but
//     the stored name differs (mismatch). Rendered as art cards.
//   • Duplicates — two sub-views: exact byte-identical copies (same md5) and the
//     same game held as multiple region/revision copies (1G1R). Rendered as
//     grouped compact lists so filename/region/size drive the keep decision.
// Per-game actions reuse the global cog options modal (identify/re-match, hide).
// Batch actions operate on the selection: Hide (reversible), Scrape, Delete.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import GameCard from "@/components/GameCard";
import GameCardCog from "@/components/GameCardCog";
import { platformBySlug } from "@/lib/platforms";
import { formatBytes } from "@/lib/format";

interface ReviewRom {
  id: number;
  title: string;
  boxart_url: string | null;
  video_url: string | null;
  platform_slug: string;
  variant: string | null;
  language: string | null;
  filename: string;
  dat_status: string | null;
  favorite: number;
  playtime_seconds: number;
}
interface HashGroup { md5: string; count: number; items: ReviewRom[] }
interface TitleMember {
  id: number;
  title: string;
  filename: string;
  region: string | null;
  revision: string | null;
  size_bytes: number;
  platform_slug: string;
  dat_status: string | null;
}
interface TitleGroup {
  slug: string;
  platform_name: string;
  displayTitle: string;
  count: number;
  suggestedKeepId: number;
  members: TitleMember[];
}
type Counts = { unidentified: number; hash: number; title: number };
interface Health {
  total: number;
  scraped: number;
  withArt: number;
  hashed: number;
  datVerified: number;
  datMismatch: number;
  datUnknown: number;
  missingFiles: number;
}

type Top = "unidentified" | "duplicates" | "health";
type Sub = "hash" | "title";

const UNI_LIMIT = 60;
const GROUP_LIMIT = 20;

export default function ReviewBrowser() {
  const t = useTranslations("libraryReview");
  const [top, setTop] = useState<Top>("unidentified");
  const [sub, setSub] = useState<Sub>("hash");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<ReviewRom[]>([]);
  const [hashGroups, setHashGroups] = useState<HashGroup[]>([]);
  const [titleGroups, setTitleGroups] = useState<TitleGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Counts>({ unidentified: 0, hash: 0, title: 0 });
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<string>("");

  const apiTab: "unidentified" | "hash" | "title" | "health" =
    top === "unidentified" ? "unidentified" : top === "health" ? "health" : sub;
  const limit = top === "unidentified" ? UNI_LIMIT : GROUP_LIMIT;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/library/review?tab=${apiTab}&offset=${offset}&limit=${limit}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      setCounts(data.counts ?? { unidentified: 0, hash: 0, title: 0 });
      setTotal(data.total ?? 0);
      if (apiTab === "health") setHealth(data.health ?? null);
      else if (apiTab === "unidentified") setRows(data.rows ?? []);
      else if (apiTab === "hash") setHashGroups(data.groups ?? []);
      else setTitleGroups(data.groups ?? []);
    } finally {
      setLoading(false);
    }
  }, [apiTab, offset, limit]);

  useEffect(() => { void load(); }, [load]);
  // reset paging + selection whenever the active view changes
  useEffect(() => { setOffset(0); setSel(new Set()); }, [top, sub]);

  const toggle = (id: number) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  async function refresh() { setSel(new Set()); await load(); }

  async function hideIds(ids: number[]) {
    if (!ids.length) return;
    setBusy(t("working", { done: 0, total: ids.length }));
    await fetch("/api/audit/dedupe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hideIds: ids }),
    });
    setBusy("");
    await refresh();
  }

  async function scrapeIds(ids: number[]) {
    let done = 0;
    for (const id of ids) {
      setBusy(t("working", { done, total: ids.length }));
      await fetch(`/api/roms/${id}/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadataOnly: false }),
      }).catch(() => {});
      done++;
    }
    setBusy("");
    await refresh();
  }

  async function deleteIds(ids: number[]) {
    if (!ids.length) return;
    if (!window.confirm(t("confirmDelete", { count: ids.length }))) return;
    let done = 0;
    for (const id of ids) {
      setBusy(t("working", { done, total: ids.length }));
      await fetch(`/api/roms/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteFile: true }),
      }).catch(() => {});
      done++;
    }
    setBusy("");
    await refresh();
  }

  const selIds = [...sel];
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;

  const TopTab = ({ id, label, count }: { id: Top; label: string; count: number }) => (
    <button
      type="button"
      onClick={() => setTop(id)}
      className={`rounded-[3px] px-4 py-2 text-[15px] font-semibold transition-colors ${
        top === id ? "bg-[#1a9fff] text-white" : "bg-white/[0.06] text-body hover:bg-white/10"
      }`}
    >
      {label} <span className="tabular-nums opacity-70">{count.toLocaleString()}</span>
    </button>
  );
  const SubTab = ({ id, label, count }: { id: Sub; label: string; count: number }) => (
    <button
      type="button"
      onClick={() => setSub(id)}
      className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
        sub === id ? "bg-white/15 text-bright" : "text-dim hover:text-body"
      }`}
    >
      {label} <span className="tabular-nums opacity-70">{count.toLocaleString()}</span>
    </button>
  );

  const StatusBadge = ({ s }: { s: string | null }) =>
    s === "unknown" || s === "mismatch" ? (
      <span
        className={`rounded-[2px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          s === "unknown" ? "bg-[#e5534b]/20 text-[#e5534b]" : "bg-[#d9a441]/20 text-[#d9a441]"
        }`}
      >
        {s === "unknown" ? t("statusUnknown") : t("statusMismatch")}
      </span>
    ) : null;

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-bold text-bright">{t("title")}</h1>
      <p className="mb-4 text-[14px] text-dim">{t("intro")}</p>

      <div className="flex flex-wrap items-center gap-2">
        <TopTab id="unidentified" label={t("tabUnidentified")} count={counts.unidentified} />
        <TopTab id="duplicates" label={t("tabDuplicates")} count={counts.hash + counts.title} />
        <button
          type="button"
          onClick={() => setTop("health")}
          className={`rounded-[3px] px-4 py-2 text-[15px] font-semibold transition-colors ${
            top === "health" ? "bg-[#1a9fff] text-white" : "bg-white/[0.06] text-body hover:bg-white/10"
          }`}
        >
          {t("tabHealth")}
        </button>
      </div>

      {top === "duplicates" && (
        <div className="mt-3 flex items-center gap-1">
          <SubTab id="hash" label={t("subExact")} count={counts.hash} />
          <SubTab id="title" label={t("subSameGame")} count={counts.title} />
        </div>
      )}

      {/* selection / batch action bar */}
      {selIds.length > 0 && (
        <div className="sticky top-12 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-[4px] bg-[#1a1f27] px-4 py-2.5 ring-1 ring-white/10">
          <span className="text-[14px] font-semibold text-bright">
            {t("selectedCount", { count: selIds.length })}
          </span>
          <span className="mx-1 h-4 w-px bg-white/15" />
          <button onClick={() => void hideIds(selIds)} className={BTN}>{t("hide")}</button>
          <button onClick={() => void scrapeIds(selIds)} className={BTN}>{t("scrape")}</button>
          <button onClick={() => void deleteIds(selIds)} className={`${BTN} hover:bg-[#c0392b]`}>{t("delete")}</button>
          <button onClick={() => setSel(new Set())} className="ml-auto text-[13px] text-dim hover:text-body">{t("clear")}</button>
          {busy && <span className="text-[13px] text-accent">{busy}</span>}
        </div>
      )}

      <div className="mt-5">
        {loading ? (
          <p className="py-16 text-center text-dim">{t("loading")}</p>
        ) : apiTab === "health" ? (
          !health ? (
            <Empty msg={t("loading")} />
          ) : (
            <div className="max-w-3xl">
              <div className="mb-5 rounded-[6px] bg-white/[0.04] px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-widest text-dim">{t("totalGames")}</div>
                <div className="text-[24px] font-semibold tabular-nums text-bright">{health.total.toLocaleString()}</div>
              </div>
              <div className="flex flex-col gap-3">
                <CoverageBar label={t("covScraped")} done={health.scraped} total={health.total} />
                <CoverageBar label={t("covArt")} done={health.withArt} total={health.total} />
                <CoverageBar label={t("covHashed")} done={health.hashed} total={health.total} />
                <CoverageBar label={t("covVerified")} done={health.datVerified} total={health.total} color="bg-[#59bf40]" />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label={t("tabUnidentified")} value={counts.unidentified} tone="warn" onClick={() => setTop("unidentified")} />
                <Tile label={t("tabDuplicates")} value={counts.hash + counts.title} tone="warn" onClick={() => setTop("duplicates")} />
                <Tile label={t("missingFiles")} value={health.missingFiles} tone={health.missingFiles > 0 ? "bad" : "ok"} />
                <Tile label={t("covMismatch")} value={health.datMismatch} tone={health.datMismatch > 0 ? "warn" : "ok"} />
              </div>
            </div>
          )
        ) : apiTab === "unidentified" ? (
          rows.length === 0 ? (
            <Empty msg={t("noUnidentified")} />
          ) : (
            <div className="flex flex-wrap gap-3">
              {rows.map((r) => (
                <div key={r.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    aria-pressed={sel.has(r.id)}
                    className={`absolute left-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-[4px] border-2 text-[13px] font-bold transition-colors ${
                      sel.has(r.id)
                        ? "border-[#1a9fff] bg-[#1a9fff] text-white"
                        : "border-white/60 bg-black/50 text-transparent opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    ✓
                  </button>
                  <div className="pointer-events-none absolute bottom-9 left-1.5 z-20">
                    <StatusBadge s={r.dat_status} />
                  </div>
                  <GameCard rom={r} dims={{ w: 150, h: 210 }} showSystem />
                  <GameCardCog romId={r.id} />
                  <div className="mt-1 w-[150px] truncate text-[11px] text-dim" title={r.filename}>
                    {r.filename}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : apiTab === "hash" ? (
          hashGroups.length === 0 ? (
            <Empty msg={t("noExact")} />
          ) : (
            <div className="flex flex-col gap-4">
              {hashGroups.map((g) => (
                <GroupBox
                  key={g.md5}
                  heading={t("identicalCopies", { count: g.count })}
                  onHideExtras={() => void hideIds(g.items.slice(1).map((i) => i.id))}
                  hideLabel={t("hideExtras")}
                >
                  {g.items.map((it, i) => (
                    <MemberRow
                      key={it.id}
                      id={it.id}
                      filename={it.filename}
                      platform={platformBySlug(it.platform_slug)?.name ?? it.platform_slug}
                      right={i === 0 ? t("keeper") : undefined}
                      keeper={i === 0}
                      selected={sel.has(it.id)}
                      onToggle={() => toggle(it.id)}
                      badge={<StatusBadge s={it.dat_status} />}
                    />
                  ))}
                </GroupBox>
              ))}
            </div>
          )
        ) : titleGroups.length === 0 ? (
          <Empty msg={t("noSameGame")} />
        ) : (
          <div className="flex flex-col gap-4">
            {titleGroups.map((g) => (
              <GroupBox
                key={`${g.slug}-${g.displayTitle}`}
                heading={`${g.displayTitle} · ${g.platform_name} · ${t("copies", { count: g.count })}`}
                onHideExtras={() =>
                  void hideIds(g.members.filter((m) => m.id !== g.suggestedKeepId).map((m) => m.id))
                }
                hideLabel={t("hideExtras")}
              >
                {g.members.map((m) => (
                  <MemberRow
                    key={m.id}
                    id={m.id}
                    filename={m.filename}
                    platform={[m.region, m.revision, formatBytes(m.size_bytes)].filter(Boolean).join(" · ")}
                    right={m.id === g.suggestedKeepId ? t("keeper") : undefined}
                    keeper={m.id === g.suggestedKeepId}
                    selected={sel.has(m.id)}
                    onToggle={() => toggle(m.id)}
                    badge={<StatusBadge s={m.dat_status} />}
                  />
                ))}
              </GroupBox>
            ))}
          </div>
        )}
      </div>

      {/* pagination */}
      {!loading && total > limit && (
        <div className="mt-6 flex items-center justify-center gap-4 text-[14px]">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className={PAGER}
          >
            {t("prev")}
          </button>
          <span className="text-dim">{t("page", { page, pages })}</span>
          <button
            disabled={page >= pages}
            onClick={() => setOffset(offset + limit)}
            className={PAGER}
          >
            {t("next")}
          </button>
        </div>
      )}
    </div>
  );
}

const BTN =
  "Focusable cursor-pointer rounded-[3px] bg-[#3d4450] px-3 py-1.5 text-[13px] font-semibold text-white outline-none transition-colors hover:bg-[#4a5260] focus:ring-2 focus:ring-inset focus:ring-white/60";
const PAGER =
  "rounded-[3px] bg-white/[0.06] px-4 py-1.5 font-semibold text-body transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

function Empty({ msg }: { msg: string }) {
  return <p className="py-16 text-center text-[15px] text-dim">{msg}</p>;
}

/** One library-coverage bar: "Scraped  2,710 / 44,081  6%". */
function CoverageBar({
  label,
  done,
  total,
  color = "bg-[#1a9fff]",
}: {
  label: string;
  done: number;
  total: number;
  color?: string;
}) {
  const pctv = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[14px]">
        <span className="text-body">{label}</span>
        <span className="tabular-nums text-dim">
          {done.toLocaleString()} / {total.toLocaleString()} · {pctv}%
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${pctv}%` }} />
      </div>
    </div>
  );
}

const TONE = {
  ok: "text-[#59bf40]",
  warn: "text-[#d9a441]",
  bad: "text-[#e5534b]",
} as const;

function Tile({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone: keyof typeof TONE;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="text-[11px] font-bold uppercase tracking-widest text-dim">{label}</div>
      <div className={`mt-1 text-[22px] font-semibold tabular-nums ${value > 0 ? TONE[tone] : "text-dim"}`}>
        {value.toLocaleString()}
      </div>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="rounded-[6px] bg-white/[0.04] px-4 py-3 text-left transition-colors hover:bg-white/[0.08]">
      {body}
    </button>
  ) : (
    <div className="rounded-[6px] bg-white/[0.04] px-4 py-3">{body}</div>
  );
}

function GroupBox({
  heading,
  onHideExtras,
  hideLabel,
  children,
}: {
  heading: string;
  onHideExtras: () => void;
  hideLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[6px] bg-white/[0.03] p-3 ring-1 ring-white/5">
      <div className="mb-2 flex items-center gap-3">
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-bright">{heading}</h3>
        <button onClick={onHideExtras} className={BTN}>{hideLabel}</button>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function MemberRow({
  id,
  filename,
  platform,
  right,
  keeper,
  selected,
  onToggle,
  badge,
}: {
  id: number;
  filename: string;
  platform: string;
  right?: string;
  keeper?: boolean;
  selected: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <div
      className={`group relative flex items-center gap-3 rounded-[4px] px-3 py-2 transition-colors ${
        keeper ? "bg-[#59bf40]/10 ring-1 ring-[#59bf40]/25" : "bg-black/20 hover:bg-white/[0.04]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border-2 text-[11px] font-bold transition-colors ${
          selected ? "border-[#1a9fff] bg-[#1a9fff] text-white" : "border-white/40 text-transparent"
        }`}
      >
        ✓
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-bright" title={filename}>{filename}</div>
        <div className="truncate text-[12px] text-dim">{platform}</div>
      </div>
      {badge}
      {right && <span className="shrink-0 text-[12px] font-bold uppercase tracking-wide text-[#59bf40]">{right}</span>}
      <GameCardCog romId={id} className="!static !opacity-100 !bg-transparent hover:!bg-white/10" />
    </div>
  );
}
