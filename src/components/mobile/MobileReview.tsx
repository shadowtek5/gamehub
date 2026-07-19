"use client";

// Mobile library review / cleanup — the touch counterpart of ReviewBrowser.
// Two tabs (Unidentified · Duplicates, the latter with Exact/Same-game views),
// selection + batch Hide/Scrape/Delete, and rows that open the game (where the
// mobile options sheet offers re-identify). Same /api/library/review backend.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import GameCover from "@/components/GameCover";
import { platformBySlug } from "@/lib/platforms";
import { formatBytes } from "@/lib/format";

interface Rom {
  id: number;
  title: string;
  boxart_url: string | null;
  platform_slug: string;
  filename: string;
  dat_status: string | null;
}
interface HashGroup { md5: string; count: number; items: Rom[] }
interface TitleMember {
  id: number; title: string; filename: string; region: string | null;
  revision: string | null; size_bytes: number; platform_slug: string; dat_status: string | null;
}
interface TitleGroup {
  slug: string; platform_name: string; displayTitle: string; count: number;
  suggestedKeepId: number; members: TitleMember[];
}
type Counts = { unidentified: number; hash: number; title: number };
type Top = "unidentified" | "duplicates";
type Sub = "hash" | "title";

const UNI_LIMIT = 40;
const GROUP_LIMIT = 15;

export default function MobileReview() {
  const t = useTranslations("libraryReview");
  const [top, setTop] = useState<Top>("unidentified");
  const [sub, setSub] = useState<Sub>("hash");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Rom[]>([]);
  const [hashGroups, setHashGroups] = useState<HashGroup[]>([]);
  const [titleGroups, setTitleGroups] = useState<TitleGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Counts>({ unidentified: 0, hash: 0, title: 0 });
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState("");

  const apiTab = top === "unidentified" ? "unidentified" : sub;
  const limit = top === "unidentified" ? UNI_LIMIT : GROUP_LIMIT;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/library/review?tab=${apiTab}&offset=${offset}&limit=${limit}`, { cache: "no-store" });
      const d = await res.json();
      setCounts(d.counts ?? { unidentified: 0, hash: 0, title: 0 });
      setTotal(d.total ?? 0);
      if (apiTab === "unidentified") setRows(d.rows ?? []);
      else if (apiTab === "hash") setHashGroups(d.groups ?? []);
      else setTitleGroups(d.groups ?? []);
    } finally { setLoading(false); }
  }, [apiTab, offset, limit]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setOffset(0); setSel(new Set()); }, [top, sub]);

  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function refresh() { setSel(new Set()); await load(); }

  async function hideIds(ids: number[]) {
    if (!ids.length) return;
    setBusy(t("working", { done: 0, total: ids.length }));
    await fetch("/api/audit/dedupe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hideIds: ids }) });
    setBusy(""); await refresh();
  }
  async function scrapeIds(ids: number[]) {
    let done = 0;
    for (const id of ids) { setBusy(t("working", { done, total: ids.length })); await fetch(`/api/roms/${id}/scrape`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metadataOnly: false }) }).catch(() => {}); done++; }
    setBusy(""); await refresh();
  }
  async function deleteIds(ids: number[]) {
    if (!ids.length || !window.confirm(t("confirmDelete", { count: ids.length }))) return;
    let done = 0;
    for (const id of ids) { setBusy(t("working", { done, total: ids.length })); await fetch(`/api/roms/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleteFile: true }) }).catch(() => {}); done++; }
    setBusy(""); await refresh();
  }

  const selIds = [...sel];
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;

  const Badge = ({ s }: { s: string | null }) =>
    s === "unknown" || s === "mismatch" ? (
      <span className={`shrink-0 rounded-[2px] px-1.5 py-0.5 text-[9px] font-bold uppercase ${s === "unknown" ? "bg-[#e5534b]/20 text-[#e5534b]" : "bg-[#d9a441]/20 text-[#d9a441]"}`}>
        {s === "unknown" ? t("statusUnknown") : t("statusMismatch")}
      </span>
    ) : null;

  const Check = ({ id }: { id: number }) => (
    <button type="button" onClick={(e) => { e.preventDefault(); toggle(id); }} aria-pressed={sel.has(id)}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border-2 text-[12px] font-bold ${sel.has(id) ? "border-[#1a9fff] bg-[#1a9fff] text-white" : "border-white/40 text-transparent"}`}>✓</button>
  );

  return (
    <div>
      <div className="flex gap-2">
        {(["unidentified", "duplicates"] as Top[]).map((id) => (
          <button key={id} onClick={() => setTop(id)}
            className={`flex-1 rounded-[8px] py-2 text-[14px] font-semibold ${top === id ? "bg-[#1a9fff] text-white" : "bg-white/[0.06] text-body"}`}>
            {id === "unidentified" ? t("tabUnidentified") : t("tabDuplicates")}{" "}
            <span className="tabular-nums opacity-70">{(id === "unidentified" ? counts.unidentified : counts.hash + counts.title).toLocaleString()}</span>
          </button>
        ))}
      </div>
      {top === "duplicates" && (
        <div className="mt-2 flex gap-1">
          {(["hash", "title"] as Sub[]).map((id) => (
            <button key={id} onClick={() => setSub(id)}
              className={`rounded-full px-3 py-1 text-[12px] ${sub === id ? "bg-white/15 text-bright" : "text-dim"}`}>
              {id === "hash" ? t("subExact") : t("subSameGame")}{" "}
              <span className="tabular-nums opacity-70">{(id === "hash" ? counts.hash : counts.title).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}

      {selIds.length > 0 && (
        <div className="sticky top-0 z-20 mt-3 flex flex-wrap items-center gap-2 rounded-[8px] bg-[#1a1f27] px-3 py-2 ring-1 ring-white/10">
          <span className="text-[13px] font-semibold text-bright">{t("selectedCount", { count: selIds.length })}</span>
          <button onClick={() => void hideIds(selIds)} className={MB}>{t("hide")}</button>
          <button onClick={() => void scrapeIds(selIds)} className={MB}>{t("scrape")}</button>
          <button onClick={() => void deleteIds(selIds)} className={`${MB} active:bg-[#c0392b]`}>{t("delete")}</button>
          <button onClick={() => setSel(new Set())} className="ml-auto text-[12px] text-dim">{t("clear")}</button>
          {busy && <span className="w-full text-[12px] text-accent">{busy}</span>}
        </div>
      )}

      <div className="mt-3">
        {loading ? (
          <p className="py-12 text-center text-dim">{t("loading")}</p>
        ) : apiTab === "unidentified" ? (
          rows.length === 0 ? <p className="py-12 text-center text-dim">{t("noUnidentified")}</p> : (
            <div className="flex flex-col gap-1.5">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-2.5 rounded-[10px] bg-[#1a1f27] px-2.5 py-2 ring-1 ring-white/5">
                  <Check id={r.id} />
                  <Link href={`/mobile/game/${r.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span className="h-11 w-11 shrink-0 overflow-hidden rounded-[4px] bg-black/40">
                      <GameCover title={r.title} boxartUrl={r.boxart_url} color={platformBySlug(r.platform_slug)?.color} shortName={platformBySlug(r.platform_slug)?.shortName} className="h-full w-full" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-bright">{r.title}</span>
                      <span className="block truncate text-[11px] text-dim">{r.filename}</span>
                    </span>
                  </Link>
                  <Badge s={r.dat_status} />
                </div>
              ))}
            </div>
          )
        ) : apiTab === "hash" ? (
          hashGroups.length === 0 ? <p className="py-12 text-center text-dim">{t("noExact")}</p> : (
            <div className="flex flex-col gap-3">
              {hashGroups.map((g) => (
                <Group key={g.md5} heading={t("identicalCopies", { count: g.count })} onHide={() => void hideIds(g.items.slice(1).map((i) => i.id))} hideLabel={t("hideExtras")}>
                  {g.items.map((it, i) => <Row key={it.id} id={it.id} title={it.filename} meta={platformBySlug(it.platform_slug)?.name ?? it.platform_slug} keeper={i === 0} keepLabel={t("keeper")} check={<Check id={it.id} />} badge={<Badge s={it.dat_status} />} />)}
                </Group>
              ))}
            </div>
          )
        ) : titleGroups.length === 0 ? <p className="py-12 text-center text-dim">{t("noSameGame")}</p> : (
          <div className="flex flex-col gap-3">
            {titleGroups.map((g) => (
              <Group key={`${g.slug}-${g.displayTitle}`} heading={`${g.displayTitle} · ${t("copies", { count: g.count })}`} onHide={() => void hideIds(g.members.filter((m) => m.id !== g.suggestedKeepId).map((m) => m.id))} hideLabel={t("hideExtras")}>
                {g.members.map((m) => <Row key={m.id} id={m.id} title={m.filename} meta={[m.region, m.revision, formatBytes(m.size_bytes)].filter(Boolean).join(" · ")} keeper={m.id === g.suggestedKeepId} keepLabel={t("keeper")} check={<Check id={m.id} />} badge={<Badge s={m.dat_status} />} />)}
              </Group>
            ))}
          </div>
        )}
      </div>

      {!loading && total > limit && (
        <div className="mt-5 flex items-center justify-center gap-4 text-[13px]">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className={PG}>{t("prev")}</button>
          <span className="text-dim">{t("page", { page, pages })}</span>
          <button disabled={page >= pages} onClick={() => setOffset(offset + limit)} className={PG}>{t("next")}</button>
        </div>
      )}
    </div>
  );
}

const MB = "rounded-[6px] bg-[#3d4450] px-3 py-1 text-[12px] font-semibold text-white active:bg-[#4a5260]";
const PG = "rounded-[6px] bg-white/[0.06] px-4 py-1.5 font-semibold text-body disabled:opacity-40";

function Group({ heading, onHide, hideLabel, children }: { heading: string; onHide: () => void; hideLabel: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] bg-white/[0.03] p-2.5 ring-1 ring-white/5">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-bright">{heading}</h3>
        <button onClick={onHide} className={MB}>{hideLabel}</button>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function Row({ id, title, meta, keeper, keepLabel, check, badge }: { id: number; title: string; meta: string; keeper?: boolean; keepLabel: string; check: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-2 rounded-[6px] px-2 py-1.5 ${keeper ? "bg-[#59bf40]/10 ring-1 ring-[#59bf40]/25" : "bg-black/20"}`}>
      {check}
      <Link href={`/mobile/game/${id}`} className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-bright">{title}</span>
        <span className="block truncate text-[11px] text-dim">{meta}</span>
      </Link>
      {badge}
      {keeper && <span className="shrink-0 text-[10px] font-bold uppercase text-[#59bf40]">{keepLabel}</span>}
    </div>
  );
}
