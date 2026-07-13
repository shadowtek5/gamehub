import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getLibraryRom } from "@/lib/db";
import { platformBySlug, platformPlayable } from "@/lib/platforms";
import { listFirmware } from "@/lib/firmware";
import Emulator from "@/components/Emulator";
import RufflePlayer from "@/components/RufflePlayer";

export const dynamic = "force-dynamic";

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

  // Flash plays through Ruffle instead of an EmulatorJS core
  if (!platform.ejsCore) {
    return <RufflePlayer romId={rom.id} title={rom.title} />;
  }

  // Firmware uploaded in Settings -> served to EmulatorJS as a zip
  const hasFirmware = listFirmware(platform.slug).length > 0;

  return (
    <Emulator
      romId={rom.id}
      title={rom.title}
      core={platform.ejsCore}
      platformName={platform.name}
      platformSlug={platform.slug}
      resumeStateId={state ? Number(state) : undefined}
      biosUrl={hasFirmware ? `/api/firmware/pack/${platform.slug}` : undefined}
    />
  );
}
