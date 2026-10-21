"use client";

// "On Android" panel for one system's firmware: which Android emulators play it
// (Cocoon FE's emulator list, via /api/emulators) and where each one that needs
// BIOS files reads them from. GameHub Downloader copies the files there for
// emulators that are installed on the device. Used by Settings › Firmware and
// the per-system Firmware modal (desktop/TV and mobile).

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Player {
  id: string;
  name: string;
  package: string;
  kind: "retroarch" | "standalone";
  core: string | null;
}

interface BiosTarget {
  id: string;
  name: string;
  where: string;
}

interface EmulatorsResponse {
  source: { name: string; url: string; fetchedAt: string | null };
  platforms: Record<string, Player[]>;
  bios: BiosTarget[];
}

export default function AndroidEmulatorsPanel({ slug }: { slug: string }) {
  const t = useTranslations("androidEmulators");
  const [data, setData] = useState<EmulatorsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/emulators?platform=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: EmulatorsResponse) => alive && setData(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [slug]);

  if (failed) return null;
  if (!data) return <div className="px-2 py-2 text-[12px] text-dim">{t("loading")}</div>;

  const players = data.platforms[slug] ?? [];
  const cores = [...new Set(players.filter((p) => p.kind === "retroarch" && p.core).map((p) => p.core as string))];
  // Standalone emulators, one entry per name (Cocoon lists builds of the same app separately).
  const standalone = [...new Map(players.filter((p) => p.kind === "standalone").map((p) => [p.name, p])).values()];
  if (!cores.length && !standalone.length && !data.bios.length) return null;

  return (
    <div className="mt-1 rounded-[3px] border-t border-white/[0.06] px-2 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-dim">{t("title")}</div>
      <p className="mt-1 text-[12px] text-dim">{t("intro")}</p>
      {cores.length > 0 && (
        <div className="mt-2 text-[13px] text-body">
          <span className="font-medium text-bright">RetroArch</span>
          <span className="text-dim"> · {t("retroarch", { cores: cores.join(", ") })}</span>
        </div>
      )}
      {data.bios.map((b) => (
        <div key={b.id} className="mt-1.5 text-[13px] text-body">
          <span className="font-medium text-bright">{b.name}</span>
          <span className="text-dim"> · {t.has(`where.${b.id}`) ? t(`where.${b.id}`) : b.where}</span>
        </div>
      ))}
      {standalone.length > 0 && (
        <div className="mt-2 text-[12px] text-dim">
          {t("alsoPlays", { names: standalone.map((p) => p.name).join(", ") })}
        </div>
      )}
      <div className="mt-2 text-[11px] text-dim">
        {t("source", { name: data.source.name })}{" "}
        <a href={data.source.url} target="_blank" rel="noreferrer" className="underline hover:text-bright">
          {t("sourceLink")}
        </a>
      </div>
    </div>
  );
}
