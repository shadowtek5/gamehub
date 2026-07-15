"use client";

// Universal search (Steam-style command palette). Opens on Ctrl/Cmd+K, "/", or
// a "gh-search" event (fired by the header search buttons). Searches games,
// systems, collections and friends via /api/search, plus a static list of app
// pages matched client-side. Keyboard-navigable; routes are UI-aware (the same
// component is mounted in the desktop chrome and the mobile shell).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

interface ApiResults {
  games: { id: number; title: string; platform_slug: string; boxart_url: string | null }[];
  systems: { slug: string; name: string; shortName: string; count: number }[];
  collections: { id: number; name: string; isSmart: number }[];
  friends: { id: number; name: string; avatar_url: string | null }[];
}

interface Item {
  key: string;
  group: string;
  label: string;
  sub?: string;
  href: string;
  thumb?: string | null;
}

export default function CommandPalette({ mobile, isAdmin }: { mobile: boolean; isAdmin: boolean }) {
  const t = useTranslations("search");
  const tn = useTranslations("nav");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<ApiResults | null>(null);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const base = mobile ? "/mobile" : "";

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setRes(null);
    setSel(0);
  }, []);

  // Open triggers: Ctrl/Cmd+K, "/" (when not typing), and the gh-search event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el?.isContentEditable;
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("gh-search", onEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("gh-search", onEvent);
    };
  }, []);

  useEffect(() => {
    if (open) {
      playSound("tab");
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term) {
      setRes(null);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        setRes(await r.json());
      } catch {
        /* aborted / offline */
      }
    }, 180);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q, open]);

  // Static app pages, matched client-side.
  const pages = useMemo(() => {
    const p: { label: string; href: string }[] = [
      { label: tn("home"), href: base || "/" },
      { label: tn("library"), href: `${base}/library` },
      { label: tn("systems"), href: `${base}/systems` },
      { label: tn("collections"), href: `${base}/collections` },
      { label: tn("account"), href: mobile ? "/mobile/profile" : "/account" },
    ];
    if (isAdmin) {
      p.push(
        { label: tn("activity"), href: `${base}/activity` },
        { label: tn("downloads"), href: `${base}/downloads` },
        { label: tn("settings"), href: `${base}/settings` }
      );
    }
    return p;
  }, [tn, base, mobile, isAdmin]);

  // Flatten everything into one ordered, navigable list.
  const items: Item[] = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out: Item[] = [];
    if (ql) {
      for (const p of pages.filter((x) => x.label.toLowerCase().includes(ql))) {
        out.push({ key: `page:${p.href}`, group: t("groupPages"), label: p.label, href: p.href });
      }
    }
    for (const g of res?.games ?? []) {
      out.push({
        key: `game:${g.id}`,
        group: t("groupGames"),
        label: g.title,
        sub: g.platform_slug,
        href: `${base}/game/${g.id}`,
        thumb: g.boxart_url,
      });
    }
    for (const s of res?.systems ?? []) {
      out.push({
        key: `sys:${s.slug}`,
        group: t("groupSystems"),
        label: s.name,
        sub: t("gamesCount", { count: s.count }),
        href: `${base}/systems/${s.slug}`,
      });
    }
    for (const c of res?.collections ?? []) {
      out.push({ key: `col:${c.id}`, group: t("groupCollections"), label: c.name, href: `${base}/collections/${c.id}` });
    }
    for (const f of res?.friends ?? []) {
      out.push({ key: `friend:${f.id}`, group: t("groupFriends"), label: f.name, href: `${base}/profile/${f.id}`, thumb: f.avatar_url });
    }
    return out;
  }, [pages, res, q, t, base]);

  useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, items.length - 1)));
  }, [items.length]);

  const go = useCallback(
    (item: Item) => {
      close();
      router.push(item.href);
    },
    [close, router]
  );

  // Keyboard nav within the palette.
  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[sel];
      if (item) go(item);
    }
  };

  if (!mounted || !open) return null;

  // Group the flat list back into sections for display, preserving order.
  const groups: { title: string; items: Item[] }[] = [];
  for (const it of items) {
    let grp = groups.find((g) => g.title === it.group);
    if (!grp) {
      grp = { title: it.group, items: [] };
      groups.push(grp);
    }
    grp.items.push(it);
  }
  let flatIndex = -1;

  return createPortal(
    <div
      className="fixed inset-0 z-[9000] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-[4px]"
      onClick={close}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[10px] bg-[#1b1f27] shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5 shrink-0 text-dim">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <line x1="15.5" y1="15.5" x2="21" y2="21" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={t("placeholder")}
            className="min-w-0 flex-1 bg-transparent py-3.5 text-[16px] text-bright outline-none placeholder:text-dim"
          />
          <kbd className="hidden shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-dim sm:inline">Esc</kbd>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-[14px] text-dim">
              {q.trim() ? t("noResults") : t("hint")}
            </div>
          ) : (
            groups.map((grp) => (
              <div key={grp.title} className="mb-1">
                <div className="px-4 py-1 text-[11px] font-bold uppercase tracking-wider text-dim">{grp.title}</div>
                {grp.items.map((it) => {
                  flatIndex++;
                  const active = flatIndex === sel;
                  const idx = flatIndex;
                  return (
                    <button
                      key={it.key}
                      onMouseEnter={() => setSel(idx)}
                      onClick={() => go(it)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left outline-none ${
                        active ? "bg-accent/20" : "hover:bg-white/5"
                      }`}
                    >
                      {it.thumb && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.thumb}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-[3px] bg-[#0e141b] object-cover"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[14px] text-bright">{it.label}</span>
                      {it.sub && <span className="shrink-0 text-[12px] uppercase text-dim">{it.sub}</span>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
