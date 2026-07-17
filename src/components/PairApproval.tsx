"use client";

// Approve/deny UI for a device-pairing (QR login) request. Loads the request's
// device name + requested scope, then lets the signed-in user approve (minting
// a token the app polls for) or deny.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Info {
  device: string;
  scope: "full" | "editor" | "viewer";
  status: string;
  expired: boolean;
}

export default function PairApproval({ id }: { id: string }) {
  const t = useTranslations("pair");
  const [info, setInfo] = useState<Info | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "approved" | "denied" | "error">(
    "loading"
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/pair/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Info) => {
        if (cancelled) return;
        setInfo(d);
        if (d.expired) setState("error");
        else if (d.status === "approved" || d.status === "consumed") setState("approved");
        else if (d.status === "denied") setState("denied");
        else setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const act = useCallback(
    async (kind: "approve" | "deny") => {
      setBusy(true);
      try {
        const res = await fetch(`/api/pair/${id}/${kind}`, { method: "POST" });
        setState(res.ok ? (kind === "approve" ? "approved" : "denied") : "error");
      } catch {
        setState("error");
      } finally {
        setBusy(false);
      }
    },
    [id]
  );

  const scopeText =
    info?.scope === "viewer" ? t("scopeViewer") : info?.scope === "editor" ? t("scopeEditor") : t("scopeFull");

  return (
    <div className="w-full max-w-[400px] rounded-[8px] bg-[#161b22] p-6 text-center ring-1 ring-white/10">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-[26px] text-accent ring-1 ring-accent/40">
        🔗
      </div>

      {state === "loading" && <div className="py-6 text-[15px] text-dim">{t("loading")}</div>}

      {state === "ready" && info && (
        <>
          <div className="text-[19px] font-bold text-bright">{t("title")}</div>
          <div className="mt-2 text-[14px] leading-relaxed text-body">
            {t("prompt", { device: info.device })}
          </div>
          <div className="mt-4 rounded-[4px] bg-black/30 px-4 py-3 text-left text-[13px] text-dim ring-1 ring-white/5">
            <div className="font-semibold text-body">{t("accessLabel")}</div>
            <div className="mt-0.5">{scopeText}</div>
          </div>
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => void act("deny")}
              disabled={busy}
              className="flex-1 rounded-[3px] bg-white/10 py-2.5 text-[14px] font-semibold text-body transition-colors hover:bg-white/20 disabled:opacity-50"
            >
              {t("deny")}
            </button>
            <button
              onClick={() => void act("approve")}
              disabled={busy}
              className="flex-1 rounded-[3px] bg-accent py-2.5 text-[14px] font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50"
            >
              {t("approve")}
            </button>
          </div>
        </>
      )}

      {state === "approved" && (
        <>
          <div className="text-[19px] font-bold text-[#59bf40]">{t("approvedTitle")}</div>
          <div className="mt-2 text-[14px] leading-relaxed text-dim">{t("approvedHint")}</div>
        </>
      )}

      {state === "denied" && (
        <div className="py-2 text-[15px] font-semibold text-body">{t("deniedTitle")}</div>
      )}

      {state === "error" && (
        <>
          <div className="text-[17px] font-bold text-bright">{t("expiredTitle")}</div>
          <div className="mt-2 text-[14px] leading-relaxed text-dim">{t("expiredHint")}</div>
        </>
      )}
    </div>
  );
}
