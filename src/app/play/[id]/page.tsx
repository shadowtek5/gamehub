import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getLibraryRom, playAllowance, getEmuPrefs } from "@/lib/db";
import { platformBySlug, platformPlayable } from "@/lib/platforms";
import { listFirmware } from "@/lib/firmware";
import Emulator from "@/components/Emulator";
import RufflePlayer from "@/components/RufflePlayer";

export const dynamic = "force-dynamic";

function fmtHour(h: number): string {
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${am ? " AM" : " PM"}`;
}

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { state } = await searchParams;
  const rom = getLibraryRom(user.id, Number(id));
  if (!rom) notFound();

  const platform = platformBySlug(rom.platform_slug);
  if (!platform || !platformPlayable(platform)) notFound();

  // Kid-profile playtime limit / allowed-hours gate — block launch when spent.
  const allow = playAllowance(user.id);
  if (!allow.allowed) {
    const t = await getTranslations("playLimit");
    const msg =
      allow.reason === "schedule" && allow.window
        ? t("outsideHours", { start: fmtHour(allow.window.start), end: fmtHour(allow.window.end) })
        : t("limitReached", { minutes: allow.limitMinutes ?? 0 });
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0e141b] p-6 text-center">
        <div className="flex max-w-[420px] flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#d9a441]/15 text-[26px] text-[#d9a441] ring-1 ring-[#d9a441]/40">
            ⏱
          </div>
          <div>
            <div className="text-[19px] font-bold text-bright">{t("title")}</div>
            <div className="mt-1.5 text-[14px] leading-relaxed text-dim">{msg}</div>
          </div>
          <Link
            href={`/game/${rom.id}`}
            className="mt-1 rounded-[3px] bg-white/10 px-5 py-2 text-[14px] font-medium text-body transition-colors hover:bg-white/20 hover:text-bright"
          >
            {t("back")}
          </Link>
        </div>
      </div>
    );
  }

  // Flash plays through Ruffle instead of an EmulatorJS core
  if (!platform.ejsCore) {
    return <RufflePlayer romId={rom.id} title={rom.title} />;
  }

  // Firmware uploaded in Settings -> served to EmulatorJS as a zip
  const hasFirmware = listFirmware(platform.slug).length > 0;
  const shader = getEmuPrefs(user.id, rom.id).shader ?? undefined;

  return (
    <Emulator
      romId={rom.id}
      title={rom.title}
      core={platform.ejsCore}
      platformName={platform.name}
      platformSlug={platform.slug}
      resumeStateId={state ? Number(state) : undefined}
      biosUrl={hasFirmware ? `/api/firmware/pack/${platform.slug}` : undefined}
      shader={shader}
      gameLogo={rom.logo_url ?? undefined}
      gameCover={rom.boxart_url ?? rom.hero_url ?? rom.screenshot_url ?? undefined}
    />
  );
}
