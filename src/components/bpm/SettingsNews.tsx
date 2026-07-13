"use client";

// Settings › News — admin control over the home page's What's New feed:
//   • post / delete announcements shown to everyone
//   • toggle external ROM-hacking / translation feeds and edit the feed list
//   • force a refresh and see per-feed health
// GameHub app news + library milestones are automatic and not configured here.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GpSubHeader, GpButton, GpToggle, GpRow } from "./primitives";

interface Announcement {
  id: number;
  title: string;
  body: string;
  published: number;
  created_at: string;
}
interface Feed {
  url: string;
  label: string;
}
interface FeedStatus {
  url: string;
  label: string;
  fetched_at: string | null;
  ok: boolean;
  error: string | null;
  count: number;
}

const inputCls =
  "w-full rounded-[3px] border border-white/10 bg-black/30 px-3 py-2 text-[14px] text-body outline-none focus:border-accent";

export default function SettingsNews() {
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const [external, setExternal] = useState(true);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [statuses, setStatuses] = useState<FeedStatus[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const t = useTranslations("settingsAudioGroup.news");

  useEffect(() => {
    fetch("/api/news/announcements")
      .then((r) => r.json())
      .then((d) => setAnns(d.announcements ?? []))
      .catch(() => {});
    fetch("/api/news/feeds")
      .then((r) => r.json())
      .then((d) => {
        setFeeds(d.feeds ?? []);
        setExternal(d.external ?? true);
        setStatuses(d.statuses ?? []);
      })
      .catch(() => {});
  }, []);

  async function postAnnouncement() {
    if (!title.trim()) return;
    const res = await fetch("/api/news/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    const d = await res.json();
    if (res.ok) {
      setAnns(d.announcements ?? []);
      setTitle("");
      setBody("");
    } else setMsg(d.error ?? t("failedToPost"));
  }

  async function removeAnnouncement(id: number) {
    const res = await fetch(`/api/news/announcements/${id}`, { method: "DELETE" });
    const d = await res.json();
    if (res.ok) setAnns(d.announcements ?? []);
  }

  async function saveFeeds(next: { feeds?: Feed[]; external?: boolean }) {
    const res = await fetch("/api/news/feeds", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const d = await res.json();
    if (res.ok) {
      setFeeds(d.feeds ?? []);
      setExternal(d.external ?? external);
    }
  }

  function addFeed() {
    if (!newUrl.trim()) return;
    const next = [...feeds, { url: newUrl.trim(), label: newLabel.trim() || newUrl.trim() }];
    setFeeds(next);
    setNewUrl("");
    setNewLabel("");
    void saveFeeds({ feeds: next });
  }

  function removeFeed(url: string) {
    const next = feeds.filter((f) => f.url !== url);
    setFeeds(next);
    void saveFeeds({ feeds: next });
  }

  async function refreshNow() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/news/feeds", { method: "POST" });
      const d = await res.json();
      if (res.ok) setStatuses(d.statuses ?? []);
      setMsg(t("refreshedFeeds"));
    } finally {
      setBusy(false);
    }
  }

  const statusFor = (url: string) => statuses.find((s) => s.url === url);

  return (
    <div className="panel space-y-8 p-6">
      <GpSubHeader>{t("homePageNews")}</GpSubHeader>
      <p className="-mt-4 text-[13px] text-dim">
        {t("homePageNewsDesc")}
      </p>

      {/* ---------------- Announcements ---------------- */}
      <section>
        <GpSubHeader>{t("announcements")}</GpSubHeader>
        <div className="space-y-2">
          <input
            className={inputCls}
            placeholder={t("announcementTitlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className={`${inputCls} min-h-[72px] resize-y`}
            placeholder={t("messagePlaceholder")}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <GpButton primary onClick={postAnnouncement} disabled={!title.trim()}>
              {t("postAnnouncement")}
            </GpButton>
            {msg && <span className="text-[12px] text-dim">{msg}</span>}
          </div>
        </div>

        {anns.length > 0 && (
          <ul className="mt-4 space-y-2">
            {anns.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-3 rounded-[3px] bg-black/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-bright">{a.title}</div>
                  {a.body && <div className="line-clamp-2 text-[12px] text-dim">{a.body}</div>}
                  <div className="mt-0.5 text-[11px] text-dim/70">{a.created_at.slice(0, 10)}</div>
                </div>
                <GpButton onClick={() => removeAnnouncement(a.id)}>{t("delete")}</GpButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- External feeds ---------------- */}
      <section>
        <GpRow
          label={t("romHackingNews")}
          description={t("romHackingNewsDesc")}
        >
          <GpToggle
            on={external}
            label={t("romHackingNews")}
            onChange={(v) => {
              setExternal(v);
              void saveFeeds({ external: v });
            }}
          />
        </GpRow>

        <ul className="space-y-2">
          {feeds.map((f) => {
            const s = statusFor(f.url);
            return (
              <li
                key={f.url}
                className="flex items-center justify-between gap-3 rounded-[3px] bg-black/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] text-body">{f.label}</div>
                  <div className="truncate text-[11px] text-dim/70">{f.url}</div>
                  {s && (
                    <div className={`text-[11px] ${s.ok ? "text-[#59bf40]" : "text-danger"}`}>
                      {s.ok
                        ? t("feedStatusOk", {
                            count: s.count,
                            when: s.fetched_at ? s.fetched_at.slice(0, 16).replace("T", " ") : "",
                          })
                        : t("feedStatusError", { error: s.error ?? t("notFetchedYet") })}
                    </div>
                  )}
                </div>
                <GpButton onClick={() => removeFeed(f.url)}>{t("remove")}</GpButton>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_auto]">
          <input
            className={inputCls}
            placeholder={t("feedUrlPlaceholder")}
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder={t("labelPlaceholder")}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <GpButton onClick={addFeed} disabled={!newUrl.trim()}>
            {t("addFeed")}
          </GpButton>
        </div>

        <div className="mt-3">
          <GpButton onClick={refreshNow} disabled={busy || !external}>
            {busy ? t("refreshing") : t("refreshNow")}
          </GpButton>
        </div>
      </section>
    </div>
  );
}
