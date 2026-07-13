import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getLibraryRom } from "@/lib/db";
import { formatBytes } from "@/lib/format";
import RomProperties from "@/components/RomProperties";

export const dynamic = "force-dynamic";

export default async function MobilePropertiesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const t = await getTranslations("mobileGamePage.properties");
  if (!user.isEditor) redirect("/mobile");
  const { id } = await params;
  const rom = getLibraryRom(user.id, Number(id));
  if (!rom) notFound();

  return (
    <div>
      <div className="mb-4 mt-1 flex items-center gap-2">
        <Link href={`/mobile/game/${rom.id}`} className="text-dim" aria-label={t("back")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[22px] font-black text-bright">{t("title")}</h1>
      </div>
      <RomProperties
        mobile
        isAdmin={user.isAdmin}
        rom={{
          id: rom.id,
          filename: rom.filename,
          path: rom.path,
          size: formatBytes(rom.size_bytes),
          added: rom.added_at.slice(0, 10),
          title: rom.title,
          platform_slug: rom.platform_slug,
          region: rom.region,
          boxart_url: rom.boxart_url,
          hero_url: rom.hero_url,
          icon_url: rom.icon_url,
          description: rom.description,
          developer: rom.developer,
          publisher: rom.publisher,
          genre: rom.genre,
          players: rom.players,
          rating: rom.rating,
          release_date: rom.release_date,
          language: rom.language,
          scraped_at: rom.scraped_at,
          metadata_source: rom.metadata_source,
          theme_url: rom.theme_url,
          theme_yt_id: rom.theme_yt_id,
        }}
      />
    </div>
  );
}
