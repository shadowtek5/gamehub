import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { browseFacets } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import MobileLibrary from "@/components/mobile/MobileLibrary";
import ScrollToTop from "@/components/ScrollToTop";

export const dynamic = "force-dynamic";

export default async function MobileLibraryPage() {
  const user = await requireUser();
  const t = await getTranslations("mobilePagesA.library");
  const tr = await getTranslations("libraryReview");
  const { platforms, variants, genres, languages } = browseFacets();
  return (
    <div>
      <div className="mb-4 mt-1 flex items-center justify-between gap-2">
        <h1 className="text-[22px] font-black text-bright">{t("title")}</h1>
        {user.isAdmin && (
          <Link
            href="/mobile/library/review"
            className="shrink-0 rounded-[8px] bg-white/[0.08] px-3 py-1.5 text-[13px] font-semibold text-body active:bg-white/15"
          >
            {tr("title")}
          </Link>
        )}
      </div>
      <MobileLibrary platforms={platforms} variants={variants} genres={genres} languages={languages} />
      <ScrollToTop className="bottom-[84px] right-4" />
    </div>
  );
}
