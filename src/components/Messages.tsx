"use client";

// Friend direct messages (Steam-style chat). A conversation list on the left and
// the open thread on the right (desktop), or one pane at a time (mobile). Polls
// /api/messages for the inbox and /api/messages/[id] for the open thread.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { timeAgo } from "@/lib/format";
import { playSound } from "@/lib/sounds";

interface Conversation {
  otherId: number;
  name: string;
  avatar_url: string | null;
  presence: "online" | "away" | "offline";
  lastBody: string | null;
  lastAt: string | null;
  lastFromMe: boolean;
  unread: number;
}
interface ChatMessage {
  id: number;
  senderId: number;
  recipientId: number;
  body: string;
  created_at: string;
}
interface Other {
  id: number;
  name: string;
  avatar_url: string | null;
  presence: "online" | "away" | "offline";
}

const DOT: Record<string, string> = { online: "#57cbde", away: "#d9a441", offline: "#6b7280" };

function Avatar({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
  ) : (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-[#3d4450] text-[13px] font-black text-white"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function Messages({
  currentUserId,
  mobile = false,
  initialTo,
}: {
  currentUserId: number;
  mobile?: boolean;
  initialTo?: number;
}) {
  const t = useTranslations("messages");
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [sel, setSel] = useState<number | null>(initialTo ?? null);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [other, setOther] = useState<Other | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selRef = useRef(sel);
  selRef.current = sel;

  const loadInbox = useCallback(async () => {
    try {
      const r = await fetch("/api/messages", { cache: "no-store" });
      const d = await r.json();
      setConvos(d.conversations ?? []);
    } catch {}
  }, []);

  const loadThread = useCallback(async (otherId: number) => {
    try {
      const r = await fetch(`/api/messages/${otherId}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setThread(d.messages ?? []);
      setOther(d.other ?? null);
    } catch {}
  }, []);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (sel == null) return;
    void loadThread(sel);
  }, [sel, loadThread]);

  // Poll: inbox every 8s, the open thread every 4s.
  useEffect(() => {
    const a = setInterval(() => void loadInbox(), 8000);
    const b = setInterval(() => {
      if (selRef.current != null) void loadThread(selRef.current);
    }, 4000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [loadInbox, loadThread]);

  // Keep the thread scrolled to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, sel]);

  async function send() {
    const text = input.trim();
    if (!text || sel == null || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/messages/${sel}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (r.ok) {
        const d = await r.json();
        playSound("tab");
        setInput("");
        setThread((cur) => [...cur, d.message]);
        void loadInbox();
      }
    } finally {
      setBusy(false);
    }
  }

  const showList = !mobile || sel == null;
  const showThread = !mobile || sel != null;

  const list = (
    <div className={`${mobile ? "" : "w-[300px] shrink-0 border-r border-white/10"} overflow-y-auto`}>
      {convos.length === 0 ? (
        <div className="p-4 text-[13px] text-dim">{t("noFriends")}</div>
      ) : (
        convos.map((c) => (
          <button
            key={c.otherId}
            onClick={() => setSel(c.otherId)}
            className={`flex w-full items-center gap-3 border-b border-white/5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-white/5 ${
              sel === c.otherId ? "bg-white/10" : ""
            }`}
          >
            <span className="relative shrink-0">
              <Avatar name={c.name} url={c.avatar_url} />
              <span
                className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[#12161c]"
                style={{ backgroundColor: DOT[c.presence] }}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-bright">{c.name}</span>
                {c.unread > 0 && (
                  <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] font-bold text-black">
                    {c.unread}
                  </span>
                )}
              </span>
              <span className="block truncate text-[12px] text-dim">
                {c.lastBody ? `${c.lastFromMe ? `${t("you")}: ` : ""}${c.lastBody}` : t("noMessagesYet")}
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  );

  const threadPane = (
    <div className="flex min-w-0 flex-1 flex-col">
      {sel == null ? (
        <div className="flex flex-1 items-center justify-center p-6 text-[14px] text-dim">{t("pickConversation")}</div>
      ) : (
        <>
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
            {mobile && (
              <button onClick={() => setSel(null)} className="rounded p-1 text-dim hover:text-bright" aria-label={t("back")}>
                ‹
              </button>
            )}
            {other && <Avatar name={other.name} url={other.avatar_url} size={30} />}
            <span className="truncate text-[15px] font-semibold text-bright">{other?.name ?? ""}</span>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {thread.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-dim">{t("sayHi")}</div>
            ) : (
              thread.map((m) => {
                const mine = m.senderId === currentUserId;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-[10px] px-3 py-2 text-[14px] ${
                        mine ? "bg-accent text-black" : "bg-[#23262e] text-body"
                      }`}
                      title={timeAgo(m.created_at)}
                    >
                      <span className="whitespace-pre-line break-words">{m.body}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-white/10 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={t("messagePlaceholder")}
              className="min-w-0 flex-1 rounded-[6px] bg-[#12161c] px-3 py-2.5 text-[14px] text-bright outline-none ring-1 ring-white/10 placeholder:text-dim focus:ring-2 focus:ring-white"
            />
            <button
              onClick={send}
              disabled={!input.trim() || busy}
              className="Focusable shrink-0 cursor-pointer rounded-[6px] bg-accent px-4 py-2.5 text-[14px] font-semibold text-black outline-none hover:opacity-90 focus:ring-2 focus:ring-white disabled:opacity-40"
            >
              {t("send")}
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-160px)] min-h-[420px] overflow-hidden rounded-[8px] bg-[#1b1f27] ring-1 ring-white/10">
      {showList && list}
      {showThread && threadPane}
    </div>
  );
}
