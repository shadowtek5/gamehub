import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getLibraryRom } from "@/lib/db";
import { formatBytes } from "@/lib/format";
import RomProperties from "@/components/RomProperties";

export const dynamic = "force-dynamic";

export default async function PropertiesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user.isEditor) redirect("/");
  const { id } = await params;
  const rom = getLibraryRom(user.id, Number(id));
  if (!rom) notFound();

  return (
    <main className="mx-auto max-w-[1300px] px-6 py-6">
      <RomProperties
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
    </main>
  );
}
