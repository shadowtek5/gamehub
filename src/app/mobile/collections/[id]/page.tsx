import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb, CollectionRow, browseFacets } from "@/lib/db";
import MobileLibrary from "@/components/mobile/MobileLibrary";
import DeleteCollectionButton from "@/components/DeleteCollectionButton";

export const dynamic = "force-dynamic";

export default async function MobileCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("mobilePagesB");
  const user = await requireUser();
  const { id } = await params;
  const collection = getDb()
    .prepare("SELECT * FROM collections WHERE id = ? AND (user_id = ? OR is_public = 1)")
    .get(Number(id), user.id) as CollectionRow | undefined;
  if (!collection) notFound();
  const { platforms, genres, languages } = browseFacets();

  return (
    <div>
      <div className="mb-4 mt-1 flex items-center gap-2">
        <Link href="/mobile/collections" className="text-dim" aria-label={t("collectionDetail.backToCollections")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[22px] font-black text-bright">{collection.name}</h1>
        {collection.user_id === user.id && (
          <DeleteCollectionButton collectionId={collection.id} redirectTo="/mobile/collections" />
        )}
      </div>
      <MobileLibrary collectionLock={String(collection.id)} platforms={platforms} genres={genres} languages={languages} />
    </div>
  );
}
