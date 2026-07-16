"use client";

// Pick specific games from a system's library to build a CUSTOM cover collage
// (card + hero) that takes priority over the auto mosaic and is never overwritten
// by the drift-refresh. Rendered through a portal to document.body so the fixed
// overlay escapes the mobile chrome's transformed ancestors (see AGENTS.md).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

interface Game {
  id: number;
  title: string;
  cover: string;
}

export default function CustomCollageManager({
  slug,
  open,
  onClose,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("customCollage");
  const router = useRouter();
  const [games, setGames] = useState<Game[] | null>(null);
  const [sel, setSel] = useState<string[]>([]); // chosen cover URLs, in pick order
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setGames(null);
    setErr("");
    void (async () => {
      const [g, c] = await Promise.all([
        fetch(`/api/systems/${slug}/games`).then((r) => r.json()).catch(() => ({ games: [] })),
        fetch(`/api/systems/${slug}/collage`).then((r) => r.json()).catch(() => ({ custom: false, covers: [] })),
      ]);
      setGames(Array.isArray(g.games) ? g.games : []);
      setCustom(!!c.custom);
      setSel(Array.isArray(c.covers) ? c.covers : []);
    })();
  }, [open, slug]);

  if (!open || typeof document === "undefined") return null;

  function toggle(cover: string) {
    playSound("tab");
    setSel((cur) => (cur.includes(cover) ? cur.filter((c) => c !== cover) : [...cur, cover]));
  }
  async function generate() {
    if (sel.length === 0) {
      setErr(t("pickSome"));
      return;
    }
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/systems/${slug}/collage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ covers: sel }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.error ?? t("failed"));
      return;
    }
    playSound("activate");
    onClose();
    router.refresh();
  }
  async function revert() {
    setBusy(true);
    setErr("");
    await fetch(`/api/systems/${slug}/collage`, { method: "DELETE" });
    setBusy(false);
    playSound("activate");
    onClose();
    router.refresh();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-[#12171f] ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-bright">{t("title")}</h2>
            <p className="truncate text-xs text-dim">{t("subtitle", { count: sel.length })}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-xl text-dim hover:text-bright" aria-label={t("close")}>
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {games === null ? (
            <p className="p-10 text-center text-dim">{t("loading")}</p>
          ) : games.length === 0 ? (
            <p className="p-10 text-center text-dim">{t("noGames")}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
              {games.map((g) => {
                const on = sel.includes(g.cover);
                const idx = sel.indexOf(g.cover);
                return (
                  <button
                    key={g.id}
                    onClick={() => toggle(g.cover)}
                    title={g.title}
                    className={`relative aspect-[3/4] overflow-hidden rounded-md ring-2 transition ${
                      on ? "ring-accent" : "ring-transparent hover:ring-white/30"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    {on && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-black">
                        {idx + 1}
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1 py-0.5 text-[9px] text-white/90">
                      {g.title}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-white/10 px-5 py-3">
          {err && <span className="text-xs text-danger">{err}</span>}
          <div className="ml-auto flex gap-2">
            {custom && (
              <button
                onClick={revert}
                disabled={busy}
                className="rounded-md px-3 py-1.5 text-sm text-dim hover:text-bright disabled:opacity-50"
              >
                {t("revert")}
              </button>
            )}
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-dim hover:text-bright">
              {t("cancel")}
            </button>
            <button
              onClick={generate}
              disabled={busy || sel.length === 0}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {busy ? t("generating") : t("generate")}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
