"use client";

// Community guides / walkthroughs for a game. An inline three-view surface:
// list → read (full guide, with edit/delete for the author or an admin) →
// editor (new or edit). Backed by /api/roms/[id]/guides and /api/guides/[gid].

import { useState } from "react";
import { useTranslations } from "next-intl";
import { timeAgo } from "@/lib/format";
import { playSound } from "@/lib/sounds";
import type { GuideRow } from "@/lib/db";

type View = { mode: "list" } | { mode: "read"; id: number } | { mode: "editor"; id: number | null };

export default function Guides({
  romId,
  currentUserId,
  isAdmin,
  initial,
}: {
  romId: number;
  currentUserId: number;
  isAdmin: boolean;
  initial: GuideRow[];
}) {
  const t = useTranslations("guides");
  const [guides, setGuides] = useState<GuideRow[]>(initial);
  const [view, setView] = useState<View>({ mode: "list" });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const canEdit = (g: GuideRow) => g.userId === currentUserId || isAdmin;
  const current = view.mode === "read" ? guides.find((g) => g.id === view.id) : undefined;

  function openNew() {
    setTitle("");
    setBody("");
    setView({ mode: "editor", id: null });
  }
  function openEdit(g: GuideRow) {
    setTitle(g.title);
    setBody(g.body);
    setView({ mode: "editor", id: g.id });
  }

  async function save() {
    if (busy || !title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      const editingId = view.mode === "editor" ? view.id : null;
      const res = await fetch(
        editingId ? `/api/guides/${editingId}` : `/api/roms/${romId}/guides`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body }),
        }
      );
      if (res.ok) {
        playSound("confirm");
        const data = await res.json();
        setGuides(data.guides ?? []);
        setView(data.guide ? { mode: "read", id: data.guide.id } : { mode: "list" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/guides/${id}`, { method: "DELETE" });
      if (res.ok) {
        playSound("back");
        setGuides((await res.json()).guides ?? []);
        setConfirmDel(false);
        setView({ mode: "list" });
      }
    } finally {
      setBusy(false);
    }
  }

  const backBtn = (onClick: () => void) => (
    <button
      onClick={onClick}
      className="Focusable mb-4 inline-flex cursor-pointer items-center gap-1 rounded-[3px] px-2 py-1 text-[13px] font-semibold text-dim outline-none hover:text-bright focus:ring-2 focus:ring-white"
    >
      ‹ {t("back")}
    </button>
  );

  // ---- Editor ----
  if (view.mode === "editor") {
    return (
      <div>
        {backBtn(() => setView({ mode: "list" }))}
        <div className="mb-3 text-[15px] font-bold text-bright">{view.id ? t("editGuide") : t("newGuide")}</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titlePlaceholder")}
          maxLength={160}
          className="mb-2 w-full rounded-[4px] bg-[#12161c] px-3 py-2.5 text-[15px] font-semibold text-bright outline-none ring-1 ring-white/10 placeholder:text-dim focus:ring-2 focus:ring-white"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("bodyPlaceholder")}
          rows={12}
          maxLength={40000}
          className="w-full resize-y rounded-[4px] bg-[#12161c] px-3 py-2.5 text-[14px] leading-relaxed text-bright outline-none ring-1 ring-white/10 placeholder:text-dim focus:ring-2 focus:ring-white"
        />
        <div className="mt-3 flex gap-2">
          <button
            onClick={save}
            disabled={busy || !title.trim() || !body.trim()}
            className="Focusable cursor-pointer rounded-[3px] bg-accent px-5 py-2 text-[14px] font-semibold text-black outline-none hover:opacity-90 focus:ring-2 focus:ring-white disabled:opacity-40"
          >
            {t("save")}
          </button>
          <button
            onClick={() => setView({ mode: "list" })}
            className="Focusable cursor-pointer rounded-[3px] bg-[#3d4450] px-4 py-2 text-[14px] font-semibold text-white outline-none hover:bg-[#464e5c] focus:ring-2 focus:ring-white"
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    );
  }

  // ---- Read ----
  if (view.mode === "read" && current) {
    return (
      <div>
        {backBtn(() => { setConfirmDel(false); setView({ mode: "list" }); })}
        <h2 className="text-[22px] font-bold text-bright">{current.title}</h2>
        <div className="mt-1 text-[12px] text-dim">
          {t("by", { name: current.authorName })} · {timeAgo(current.updated_at ?? current.created_at)}
        </div>
        <div className="mt-4 whitespace-pre-line text-[14px] leading-relaxed text-body">{current.body}</div>
        {canEdit(current) && (
          <div className="mt-5 flex items-center gap-2">
            <button
              onClick={() => openEdit(current)}
              className="Focusable cursor-pointer rounded-[3px] bg-[#3d4450] px-4 py-2 text-[13px] font-semibold text-white outline-none hover:bg-[#464e5c] focus:ring-2 focus:ring-white"
            >
              {t("edit")}
            </button>
            {confirmDel ? (
              <>
                <span className="text-[13px] text-dim">{t("deleteConfirm")}</span>
                <button
                  onClick={() => void remove(current.id)}
                  disabled={busy}
                  className="Focusable cursor-pointer rounded-[3px] bg-[#c0392b] px-4 py-2 text-[13px] font-semibold text-white outline-none hover:bg-[#d64535] focus:ring-2 focus:ring-white disabled:opacity-50"
                >
                  {t("delete")}
                </button>
                <button onClick={() => setConfirmDel(false)} className="Focusable cursor-pointer rounded-[3px] px-3 py-2 text-[13px] text-dim outline-none hover:text-bright">
                  {t("cancel")}
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDel(true)}
                className="Focusable cursor-pointer rounded-[3px] px-4 py-2 text-[13px] font-semibold text-dim outline-none hover:text-[#e5544b] focus:ring-2 focus:ring-white"
              >
                {t("delete")}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---- List ----
  return (
    <div>
      <button
        onClick={openNew}
        className="Focusable mb-4 inline-flex cursor-pointer items-center gap-2 rounded-[2px] bg-[#3d4450] px-4 py-2 text-[13px] font-semibold text-white outline-none hover:bg-[#464e5c] focus:ring-2 focus:ring-inset focus:ring-white"
      >
        <span className="text-[16px] leading-none">+</span> {t("writeGuide")}
      </button>
      {guides.length === 0 ? (
        <div className="text-[13px] text-dim">{t("noneYet")}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {guides.map((g) => (
            <button
              key={g.id}
              onClick={() => setView({ mode: "read", id: g.id })}
              className="Focusable w-full cursor-pointer rounded-[6px] bg-[#1b1f27] p-3.5 text-left outline-none ring-1 ring-white/5 transition-colors hover:bg-[#22272f] focus:ring-2 focus:ring-white"
            >
              <div className="truncate text-[15px] font-semibold text-bright">{g.title}</div>
              <div className="mt-0.5 text-[12px] text-dim">
                {t("by", { name: g.authorName })} · {timeAgo(g.updated_at ?? g.created_at)}
              </div>
              <div className="mt-1 line-clamp-2 text-[13px] text-body/80">{g.body}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
