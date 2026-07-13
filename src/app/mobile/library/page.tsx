import { requireUser } from "@/lib/auth";
import { browseFacets } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import MobileLibrary from "@/components/mobile/MobileLibrary";

export const dynamic = "force-dynamic";

export default async function MobileLibraryPage() {
  await requireUser();
  const t = await getTranslations("mobilePagesA.library");
  const { platforms, genres, languages } = browseFacets();
  return (
    <div>
      <h1 className="mb-4 mt-1 text-[22px] font-black text-bright">{t("title")}</h1>
      <MobileLibrary platforms={platforms} genres={genres} languages={languages} />
    </div>
  );
}
