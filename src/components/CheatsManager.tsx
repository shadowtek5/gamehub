"use client";

// Per-game cheat manager shown on the game page (playable systems). Lists the
// user's cheats with on/off + remove, lets them add a custom Game Genie / raw
// code, and offers any prebuilt catalog cheats for the game. Changes are saved
// server-side and applied to EmulatorJS the next time the game launches (and
// live from the in-game Quick Menu). Same component on desktop and mobile.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Cheat {
  id: number;
  name: string;
  code: string;
  enabled: number | boolean;
}

export default function CheatsManager({ romId }: { romId: number }) {
  const t = useTranslations("cheats");
  const [cheats, setCheats] = useState<Cheat[] | null>(null);
  const [prebuilt, setPrebuilt] = useState<{ name: string; code: string }[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/roms/${romId}/cheats`, { cache: "no-store" });
      const d = await res.json();
      setCheats(d.cheats ?? []);
      setPrebuilt(d.prebuilt ?? []);
    } catch {
      setCheats([]);
    }
  }, [romId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addable = prebuilt.filter(
    (p) => !(cheats ?? []).some((c) => c.code.toUpperCase() === p.code.toUpperCase())
  );
  const q = query.trim().toLowerCase();
  const shown = q ? addable.filter((p) => p.name.toLowerCase().includes(q)) : addable;

  async function add(n: string, c: string) {
    if (!c.trim() || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/roms/${romId}/cheats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, code: c }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: Cheat) {
    const enabled = c.enabled ? 0 : 1;
    setCheats((prev) => (prev ?? []).map((x) => (x.id === c.id ? { ...x, enabled } : x)));
    await fetch(`/api/roms/${romId}/cheats`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, enabled: !!enabled }),
    }).catch(() => {});
  }

  async function remove(c: Cheat) {
    setCheats((prev) => (prev ?? []).filter((x) => x.id !== c.id));
    await fetch(`/api/roms/${romId}/cheats`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id }),
    }).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Current cheats */}
      {cheats === null ? (
        <div className="text-[13px] text-dim">{t("loading")}</div>
      ) : cheats.length === 0 ? (
        <div className="text-[13px] text-dim">{t("empty")}</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {cheats.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-[4px] bg-white/[0.03] px-3 py-2 ring-1 ring-white/5"
            >
              <button
                onClick={() => void toggle(c)}
                aria-pressed={!!c.enabled}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  c.enabled ? "bg-accent" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                    c.enabled ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-body">{c.name}</div>
                <div className="truncate font-mono text-[12px] text-dim">{c.code.replace(/\n/g, " · ")}</div>
              </div>
              <button
                onClick={() => void remove(c)}
                className="shrink-0 rounded-[3px] px-2 py-1 text-[12px] font-medium text-dim transition-colors hover:bg-white/10 hover:text-[#e5544b]"
              >
                {t("remove")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Suggested (prebuilt) cheats for this game */}
      {addable.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-[12px] font-bold uppercase tracking-wide text-dim">
              {t("suggested")}
            </span>
            <span className="text-[12px] text-dim">{addable.length}</span>
          </div>
          {addable.length > 8 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="mb-2 w-full rounded-[4px] bg-black/30 px-3 py-1.5 text-[13px] text-bright outline-none ring-1 ring-white/10 placeholder:text-dim focus:ring-accent/60"
            />
          )}
          <div className="flex max-h-[280px] flex-wrap gap-2 overflow-y-auto">
            {shown.map((p, i) => (
              <button
                key={`${p.code}-${i}`}
                onClick={() => void add(p.name, p.code)}
                disabled={busy}
                className="rounded-full bg-white/5 px-3 py-1.5 text-[13px] font-medium text-body ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-bright disabled:opacity-50"
              >
                ＋ {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add custom code */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add(name, code).then(() => {
            setName("");
            setCode("");
          });
        }}
        className="flex flex-col gap-2 border-t border-white/10 pt-3"
      >
        <div className="text-[13px] font-semibold text-body">{t("addTitle")}</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          maxLength={80}
          className="rounded-[4px] bg-black/30 px-3 py-2 text-[14px] text-bright outline-none ring-1 ring-white/10 placeholder:text-dim focus:ring-accent/60"
        />
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("codePlaceholder")}
          rows={2}
          className="resize-y rounded-[4px] bg-black/30 px-3 py-2 font-mono text-[13px] text-bright outline-none ring-1 ring-white/10 placeholder:font-sans placeholder:text-dim focus:ring-accent/60"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-dim">{t("appliesHint")}</span>
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="rounded-[3px] bg-accent px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50"
          >
            {t("add")}
          </button>
        </div>
      </form>
    </div>
  );
}
