"use client";

// Mobile home — the phone-shaped counterpart of the Big Picture home
// (components/bpm/Home). Same content, mobile ergonomics: an always-on
// "Jump back in" shelf, then a segmented What's New / Friends / Recommended
// switch feeding a vertical feed instead of the TV carousels.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import MobileGameCard from "@/components/mobile/MobileGameCard";
import { platformBySlug } from "@/lib/platforms";
import type { HomeRom, HomeActivity, HomeShelf } from "@/components/bpm/Home";
import type { NewsSection, NewsItem } from "@/lib/news/types";

type Tab = "new" | "friends" | "recommended";

function timeAgo(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso.slice(0, 10);
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 7) return `${d}d ago`;
  const wk = Math.round(d / 7);
  if (wk < 5) return `${wk}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Relative "x ago" label that is hydration-safe: renders the stable ISO date on
// the server + first client paint (so the markup matches), then upgrades to the
// live relative time after mount. Avoids Date.now() during render.
function Ago({ iso }: { iso: string }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    // Set from timer callbacks (not synchronously in the effect body) so the
    // first client render still matches the server, then upgrades post-commit.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return <>{now ? timeAgo(iso, now) : iso.slice(0, 10)}</>;
}

function Shelf({
  title,
  subtitle,
  href,
  rows,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  rows: HomeRom[];
}) {
  const t = useTranslations("mobileHome");
  if (rows.length === 0) return null;
  return (
    <section className="mb-7">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-bright">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-[12px] text-dim">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="shrink-0 text-[12px] font-semibold text-accent">
            {t("seeAll")}
          </Link>
        )}
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {rows.map((r) => (
          <MobileGameCard
            key={r.id}
            id={r.id}
            title={r.title}
            boxartUrl={r.boxart_url}
            platformSlug={r.platform_slug}
            className="w-[104px] shrink-0"
          />
        ))}
      </div>
    </section>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const accent = item.accent ?? "var(--accent, #59bf40)";
  const inner = (
    <div className="overflow-hidden rounded-[10px] bg-[#1a1f27] ring-1 ring-white/5 active:bg-[#20262f]">
      {item.image && (
        <div className="relative aspect-[16/7] w-full overflow-hidden bg-black/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {item.overlay && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.overlay}
              alt=""
              className="absolute left-1/2 top-1/2 max-h-[62%] max-w-[70%] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow"
            />
          )}
        </div>
      )}
      <div className="p-3.5">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-dim">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} aria-hidden />
          <span className="truncate">{item.category}</span>
          {item.date && (
            <span className="ml-auto shrink-0 normal-case tracking-normal text-dim/80">
              <Ago iso={item.date} />
            </span>
          )}
        </div>
        <h3 className="text-[14px] font-bold leading-snug text-bright">{item.title}</h3>
        {item.body && (
          <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-dim">{item.body}</p>
        )}
      </div>
    </div>
  );

  if (item.url) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }
  if (item.href) {
    return (
      <Link href={item.href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

function ActivityRow({ a }: { a: HomeActivity }) {
  const t = useTranslations("mobileHome");
  const platform = platformBySlug(a.rom.platform_slug);
  return (
    <Link
      href={`/mobile/game/${a.rom.id}`}
      className="flex items-center gap-3 rounded-[10px] bg-[#1a1f27] p-2.5 ring-1 ring-white/5 active:bg-[#20262f]"
    >
      {a.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/15" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#12161c] text-dim ring-1 ring-white/15">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.7-9 6v2h18v-2c0-3.3-4-6-9-6Z" />
          </svg>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-body">
          <span className="font-semibold text-bright">{a.userName}</span> {t("played")}{" "}
          <span className="font-semibold text-bright">{a.rom.title}</span>
        </div>
        <div className="text-[11px] text-dim">
          {platform?.name ?? a.rom.platform_slug} · <Ago iso={a.playedAt} />
        </div>
      </div>
      <div className="h-12 w-9 shrink-0 overflow-hidden rounded-[4px] bg-[#12161c]">
        {a.rom.boxart_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.rom.boxart_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white/70"
            style={{ background: platform?.color ?? "#26303c" }}
          >
            {platform?.shortName ?? "?"}
          </span>
        )}
      </div>
    </Link>
  );
}

const TABS: { key: Tab; labelKey: string }[] = [
  { key: "new", labelKey: "tabNew" },
  { key: "friends", labelKey: "tabFriends" },
  { key: "recommended", labelKey: "tabRecommended" },
];

export default function MobileHome({
  userName,
  recent,
  whatsNew,
  activity,
  recommended,
  news,
}: {
  userName: string;
  recent: HomeRom[];
  whatsNew: HomeRom[];
  activity: HomeActivity[];
  recommended: HomeShelf[];
  news: NewsSection[];
}) {
  const t = useTranslations("mobileHome");
  const [tab, setTab] = useState<Tab>("new");

  return (
    <div>
      <h1 className="mb-5 mt-1 text-[22px] font-black text-bright">{t("greeting", { userName })}</h1>

      <Shelf title={t("jumpBackIn")} rows={recent} />

      {/* Segmented switch — the mobile stand-in for the BPM home's tab strip. */}
      <div className="mb-5 flex gap-1 rounded-[10px] bg-[#12161c] p-1 ring-1 ring-white/5">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex-1 rounded-[7px] px-2 py-2 text-[12px] font-semibold transition-colors ${
              tab === tb.key ? "bg-[#2a313b] text-bright" : "text-dim active:bg-white/5"
            }`}
            aria-pressed={tab === tb.key}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {tab === "new" && (
        <>
          <Shelf title={t("newToLibrary")} href="/mobile/library" rows={whatsNew} />
          {news.length === 0 ? (
            <p className="rounded-[10px] bg-[#1a1f27] p-5 text-center text-[13px] text-dim">
              {t("nothingNew")}
            </p>
          ) : (
            news.map((section) => (
              <section key={section.key} className="mb-7">
                <div className="mb-2.5 flex items-baseline justify-between gap-3">
                  <h2 className="text-[15px] font-bold text-bright">{section.title}</h2>
                  {section.key === "app" && (
                    <Link
                      href="/mobile/whats-new"
                      className="shrink-0 text-[12px] font-semibold text-accent"
                    >
                      {t("seeAll")}
                    </Link>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  {section.items.map((item) => (
                    <NewsCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ))
          )}
        </>
      )}

      {tab === "friends" && (
        <>
          {activity.length === 0 ? (
            <p className="rounded-[10px] bg-[#1a1f27] p-5 text-center text-[13px] text-dim">
              {t("noActivity")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {activity.map((a, i) => (
                <ActivityRow key={`${a.rom.id}-${a.playedAt}-${i}`} a={a} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "recommended" && (
        <>
          {recommended.length === 0 ? (
            <p className="rounded-[10px] bg-[#1a1f27] p-5 text-center text-[13px] text-dim">
              {t("noRecommended")}
            </p>
          ) : (
            recommended.map((shelf) => (
              <Shelf key={shelf.key} title={shelf.title} subtitle={shelf.subtitle} rows={shelf.roms} />
            ))
          )}
        </>
      )}

      <Link
        href="/mobile/library"
        className="flex items-center justify-center rounded-[10px] bg-accent/15 py-3 text-[14px] font-semibold text-accent active:bg-accent/25"
      >
        {t("browseLibrary")}
      </Link>
    </div>
  );
}
