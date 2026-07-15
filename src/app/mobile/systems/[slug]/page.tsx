import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { browseFacets } from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";
import MobileLibrary from "@/components/mobile/MobileLibrary";
import MobileSystemOptions from "@/components/mobile/MobileSystemOptions";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function MobileSystemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const t = await getTranslations("mobilePagesA.systemDetail");
  const { slug } = await params;
  const platform = platformBySlug(slug);
  if (!platform) notFound();
  const { genres, languages } = browseFacets(slug);

  return (
    <div>
      <div className="mb-4 mt-1 flex items-center gap-2">
        <Link href="/mobile/systems" className="text-dim" aria-label={t("backToSystems")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[22px] font-black text-bright">{platform.name}</h1>
        {user.isEditor && (
          <MobileSystemOptions slug={slug} shortName={platform.shortName} />
        )}
      </div>
      <MobileLibrary platformLock={slug} genres={genres} languages={languages} />
    </div>
  );
}
