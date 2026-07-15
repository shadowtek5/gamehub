"use client";

// Friends manager for the Account page: find people by name and send requests,
// accept/decline incoming requests, cancel outgoing ones, and see/unfriend your
// friends. All via /api/friends (+ /api/friends/search).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpConfirm } from "@/components/bpm/primitives";
import type { FriendshipState } from "@/lib/db";

type Presence = "online" | "away" | "offline";
interface FUser {
  id: number;
  name: string;
  avatar_url: string | null;
  since?: string;
  presence?: Presence;
  playing?: { romId: number; title: string } | null;
}

// Currently-playing friends get a green dot regardless of presence tier.
const PLAYING_COLOR = "#59bf40";

const PRESENCE_COLOR: Record<Presence, string> = {
  online: "#57cbde",
  away: "#d9a441",
  offline: "#6b7280",
};
function usePresenceLabels(): Record<Presence, string> {
  const t = useTranslations("accountComps.friends");
  return {
    online: t("presenceOnline"),
    away: t("presenceAway"),
    offline: t("presenceOffline"),
  };
}

function PresenceDot({ presence }: { presence?: Presence }) {
  const labels = usePresenceLabels();
  const p = presence ?? "offline";
  return (
    <span
      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[#1b222c]"
      style={{ backgroundColor: PRESENCE_COLOR[p] }}
      title={labels[p]}
      aria-label={labels[p]}
    />
  );
}
interface SearchHit {
  id: number;
  name: string;
  username: string;
  avatar_url: string | null;
  state: FriendshipState;
}
type Action = "request" | "accept" | "remove";

function Avatar({ u, size = 40 }: { u: { name: string; avatar_url: string | null }; size?: number }) {
  return u.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={u.avatar_url}
      alt=""
      className="shrink-0 rounded-full object-cover ring-1 ring-white/15"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-accent/20 font-black text-accent ring-1 ring-white/15"
      style={{ width: size, height: size }}
    >
      {u.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function AccountFriends({ hrefBase = "/profile" }: { hrefBase?: string }) {
  const t = useTranslations("accountComps.friends");
  const presenceLabels = usePresenceLabels();
  const [friends, setFriends] = useState<FUser[]>([]);
  const [incoming, setIncoming] = useState<FUser[]>([]);
  const [outgoing, setOutgoing] = useState<FUser[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<FUser | null>(null);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  const onlineCount = friends.filter((f) => f.presence === "online").length;

  const loadLists = useCallback(async () => {
    try {
      const res = await fetch("/api/friends", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setFriends(d.friends ?? []);
        setIncoming(d.incoming ?? []);
        setOutgoing(d.outgoing ?? []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const runSearch = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/friends/search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
      if (res.ok && queryRef.current.trim() === term) {
        const d = await res.json();
        setResults(d.results ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    void loadLists();
    // Keep presence + requests fresh while the page is open.
    const id = setInterval(() => void loadLists(), 45_000);
    return () => clearInterval(id);
  }, [loadLists]);

  // Debounced live search.
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults(null);
      return;
    }
    const id = setTimeout(() => void runSearch(term), 300);
    return () => clearTimeout(id);
  }, [query, runSearch]);

  async function act(action: Action, userId: number) {
    setBusy(userId);
    playSound(action === "remove" ? "back" : "confirm");
    try {
      await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userId }),
      });
      await loadLists();
      if (queryRef.current.trim()) await runSearch(queryRef.current);
    } finally {
      setBusy(null);
    }
  }

  const btn = "DialogButton Focusable shrink-0 cursor-pointer rounded-[2px] px-3 py-1.5 text-[13px] disabled:opacity-40";
  // DMs live at /messages (desktop) or /mobile/messages (mobile) — mirror hrefBase.
  const msgBase = hrefBase.startsWith("/mobile") ? "/mobile/messages" : "/messages";

  function resultAction(h: SearchHit) {
    if (h.state === "friends") return <span className="shrink-0 text-[13px] font-semibold text-dim">{t("alreadyFriends")}</span>;
    if (h.state === "outgoing")
      return (
        <button onClick={() => act("remove", h.id)} disabled={busy === h.id} className={`btn-gray ${btn}`}>
          {t("requested")}
        </button>
      );
    if (h.state === "incoming")
      return (
        <button onClick={() => act("accept", h.id)} disabled={busy === h.id} className={`btn-blue ${btn}`}>
          {t("accept")}
        </button>
      );
    return (
      <button onClick={() => act("request", h.id)} disabled={busy === h.id} className={`btn-blue ${btn}`}>
        {t("add")}
      </button>
    );
  }

  return (
    <div className="panel p-5 sm:p-6">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-bright">{t("title")}</h2>

      {/* Finder */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("findPlaceholder")}
        className="input-dark w-full px-3 py-2 text-sm"
        aria-label={t("findAriaLabel")}
      />
      {results !== null && (
        <div className="mt-2 flex flex-col gap-1.5">
          {results.length === 0 ? (
            <p className="px-1 py-2 text-[13px] text-dim">{searching ? t("searching") : t("noUsersMatch")}</p>
          ) : (
            results.map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-[8px] bg-[#1b222c] p-2.5">
                <Link href={`${hrefBase}/${h.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar u={h} size={36} />
                  <span className="min-w-0 truncate text-[14px] font-semibold text-bright">{h.name}</span>
                </Link>
                {resultAction(h)}
              </div>
            ))
          )}
        </div>
      )}

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-accent">
            {t("friendRequestCount", { count: incoming.length })}
          </div>
          <div className="flex flex-col gap-1.5">
            {incoming.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-[8px] bg-[#1b222c] p-2.5">
                <Link href={`${hrefBase}/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar u={u} size={36} />
                  <span className="min-w-0 truncate text-[14px] font-semibold text-bright">{u.name}</span>
                </Link>
                <button onClick={() => act("accept", u.id)} disabled={busy === u.id} className={`btn-blue ${btn}`}>
                  {t("accept")}
                </button>
                <button onClick={() => act("remove", u.id)} disabled={busy === u.id} className={`btn-gray ${btn}`}>
                  {t("decline")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends list — online first */}
      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-dim">
          <span>
            {t("yourFriends")} <span className="font-normal">{friends.length}</span>
          </span>
          {onlineCount > 0 && (
            <span className="flex items-center gap-1 text-[#57cbde]">
              <span className="h-2 w-2 rounded-full bg-[#57cbde]" />
              {t("onlineCount", { count: onlineCount })}
            </span>
          )}
        </div>
        {friends.length === 0 ? (
          <p className="text-[13px] text-dim">{t("noFriends")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {friends.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-[8px] bg-[#1b222c] p-2.5">
                <Link href={`${hrefBase}/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="relative shrink-0">
                    <Avatar u={u} size={36} />
                    {u.playing ? (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[#1b222c]"
                        style={{ backgroundColor: PLAYING_COLOR }}
                        title={u.playing.title}
                        aria-label={u.playing.title}
                      />
                    ) : (
                      <PresenceDot presence={u.presence} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-bright">{u.name}</span>
                    {u.playing ? (
                      <span
                        className="block truncate text-[11px]"
                        style={{ color: PLAYING_COLOR }}
                        title={u.playing.title}
                      >
                        {t("playingGame", { title: u.playing.title })}
                      </span>
                    ) : (
                      <span
                        className="block text-[11px]"
                        style={{ color: PRESENCE_COLOR[u.presence ?? "offline"] }}
                      >
                        {presenceLabels[u.presence ?? "offline"]}
                      </span>
                    )}
                  </span>
                </Link>
                <Link href={`${msgBase}?to=${u.id}`} className={`btn-gray ${btn}`} title={t("message")}>
                  {t("message")}
                </Link>
                <button
                  onClick={() => setConfirmRemove(u)}
                  disabled={busy === u.id}
                  className={`btn-gray ${btn}`}
                  title={t("removeFriend")}
                >
                  {t("remove")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outgoing pending */}
      {outgoing.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-dim">{t("requestsSent")}</div>
          <div className="flex flex-col gap-1.5">
            {outgoing.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-[8px] bg-[#1b222c] p-2.5">
                <Link href={`${hrefBase}/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar u={u} size={36} />
                  <span className="min-w-0 truncate text-[14px] font-semibold text-bright">{u.name}</span>
                </Link>
                <button onClick={() => act("remove", u.id)} disabled={busy === u.id} className={`btn-gray ${btn}`}>
                  {t("cancel")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirmRemove && (
        <GpConfirm
          title={t("removeConfirmTitle", { name: confirmRemove.name })}
          confirmLabel={t("removeFriend")}
          danger
          onConfirm={() => act("remove", confirmRemove.id)}
          onClose={() => setConfirmRemove(null)}
        >
          {t("removeConfirmBody")}
        </GpConfirm>
      )}
    </div>
  );
}
