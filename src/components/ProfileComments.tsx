"use client";

// Comments panel body for the profile page: add box + list with delete.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

export interface ProfileCommentView {
  id: number;
  body: string;
  created_at: string;
  authorName: string;
  authorAvatar: string | null;
  canDelete: boolean;
}

export default function ProfileComments({
  profileId,
  comments,
}: {
  profileId: number;
  comments: ProfileCommentView[];
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const t = useTranslations("profileComps.comments");

  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/profile/${profileId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        setText("");
        playSound("confirm");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: number) {
    await fetch(`/api/profile/${profileId}/comments?commentId=${commentId}`, {
      method: "DELETE",
    });
    playSound("back");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <input
          className="input-dark flex-1 px-4 py-3 text-sm"
          placeholder={t("addComment")}
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="btn-blue cursor-pointer px-5 py-2.5 text-sm disabled:opacity-40"
        >
          {t("post")}
        </button>
      </div>

      {comments.map((c) => (
        <div key={c.id} className="flex items-start gap-3">
          {c.authorAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.authorAvatar} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-accent/25 text-sm font-black text-accent">
              {c.authorName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-3">
              <span className="text-sm font-semibold text-accent">{c.authorName}</span>
              <span className="text-xs text-dim">{c.created_at.slice(0, 16).replace("T", " ")}</span>
              {c.canDelete && (
                <button
                  onClick={() => remove(c.id)}
                  className="ml-auto cursor-pointer text-xs text-dim hover:text-bright"
                  title={t("deleteComment")}
                >
                  ✕
                </button>
              )}
            </div>
            <p className="mt-0.5 whitespace-pre-line break-words text-sm text-body">{c.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
