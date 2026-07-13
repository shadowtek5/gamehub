"use client";

// Game activity feed. Rich cards (the look GameHub had before): a date header,
// then a gradient panel with an eyebrow "kind", title, and body — plus an
// optional left thumbnail (snapshot). Every event is attributed to its creator
// with an avatar + name in the card's top-right corner; your own status posts
// carry a delete ✕.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

export interface ActivityEntry {
  id: number;
  type: string;
  summary: string;
  detail: string | null;
  image: string | null;
  created_at: string; // "YYYY-MM-DD HH:MM:SS" (UTC)
  canDelete: boolean;
  actorId: number; // 0 = no linkable profile (e.g. the synthetic "Library")
  actorName: string;
  actorAvatar: string | null;
}

// Known activity kinds → each has a translated eyebrow label under `kind.<type>`.
const KIND = new Set<string>([
  "comment",
  "played",
  "scraped",
  "boxart",
  "hero",
  "logo",
  "screenshot",
  "video",
  "theme",
  "manual",
  "icon",
  "favorite",
  "collection",
  "added",
]);

function toDate(iso: string): Date {
  return new Date(iso.replace(" ", "T") + "Z");
}

function dayLabel(dateKey: string, t: (key: string) => string): string {
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (dateKey === iso(today)) return t("today");
  if (dateKey === iso(y)) return t("yesterday");
  const d = toDate(dateKey + " 00:00:00");
  return isNaN(d.getTime())
    ? dateKey
    : d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function timeLabel(iso: string): string {
  if (!/\d\d:\d\d/.test(iso)) return "";
  const d = toDate(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function titleOf(e: ActivityEntry): string {
  if (e.type === "added") return e.summary.replace(/^Added\s+/, "");
  return e.summary;
}

const Avatar = ({ url, name }: { url: string | null; name: string }) => (
  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-white/10">
    {url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="h-full w-full object-cover" />
    ) : (
      <span className="text-[13px] font-bold text-white/70">{name.charAt(0).toUpperCase()}</span>
    )}
  </span>
);

export default function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  const t = useTranslations("activityComps.feed");
  const router = useRouter();
  // Render straight from props so every router.refresh() (fired by any event —
  // post, favorite, art change, collection, scrape, media) shows the new feed.
  // `removed` only hides an entry optimistically until the refresh lands.
  const [removed, setRemoved] = useState<Set<number>>(new Set());

  async function remove(id: number) {
    setRemoved((cur) => new Set(cur).add(id));
    playSound("back");
    await fetch(`/api/activity/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {entries.filter((e) => !removed.has(e.id)).map((e) => {
        const hasBody = e.type === "comment" ? false : !!e.detail;
        return (
          <div key={e.id} className="appactivityday_Event_gh">
            <div className="mb-2 flex items-center border-b border-white/10 pb-1 text-xs font-bold uppercase tracking-[0.2em] text-dim">
              <span suppressHydrationWarning>{dayLabel(e.created_at.slice(0, 10), t)}</span>
              {timeLabel(e.created_at) && (
                <span className="ml-2 font-medium normal-case tracking-normal text-dim/70" suppressHydrationWarning>
                  · {timeLabel(e.created_at)}
                </span>
              )}
            </div>

            <div className="relative flex overflow-hidden rounded bg-gradient-to-r from-[#1b2635] to-[#141a22]">
              {e.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.image} alt="" aria-hidden className="hidden h-36 w-64 shrink-0 object-cover sm:block" />
              )}
              <div className="min-w-0 flex-1 p-5 pr-40">
                <div className="appactivityday_EventHeadline_gh text-xs font-bold uppercase tracking-widest text-accent">
                  {KIND.has(e.type) ? t(`kind.${e.type}`) : e.type}
                </div>
                <div className="mt-1 text-lg font-semibold text-bright">
                  {e.type === "comment" ? (
                    <span className="appactivityday_ActivityPublishedStatus_gh whitespace-pre-wrap">{e.summary}</span>
                  ) : (
                    titleOf(e)
                  )}
                </div>
                {hasBody && <p className="mt-1 max-w-2xl text-sm text-body">{e.detail}</p>}
              </div>

              {/* creator, top-right — links to their read-only profile */}
              <div className="absolute right-4 top-4 flex items-center gap-2">
                {e.actorId > 0 ? (
                  <Link
                    href={`/profile/${e.actorId}`}
                    className="Focusable flex items-center gap-2 rounded-[3px] outline-none focus:ring-2 focus:ring-inset focus:ring-white/50"
                    title={t("viewProfile", { name: e.actorName })}
                  >
                    <span className="appactivityday_ActorName_gh personanameandstatus_playerName_gh text-sm text-[#b3dfff] hover:underline">
                      {e.actorName}
                    </span>
                    <Avatar url={e.actorAvatar} name={e.actorName} />
                  </Link>
                ) : (
                  <>
                    <span className="appactivityday_ActorName_gh text-sm text-dim">{e.actorName}</span>
                    <Avatar url={e.actorAvatar} name={e.actorName} />
                  </>
                )}
                {e.canDelete && (
                  <button
                    onClick={() => void remove(e.id)}
                    title={t("delete")}
                    className="appactivityday_DeleteButton_gh Focusable ml-1 flex h-7 w-7 items-center justify-center rounded-[2px] text-[#707070] outline-none transition-colors hover:bg-white/10 hover:text-white focus:ring-2 focus:ring-inset focus:ring-white/50"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" className="h-4 w-4"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
