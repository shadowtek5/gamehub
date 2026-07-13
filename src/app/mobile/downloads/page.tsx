import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import MobileDownloads from "@/components/mobile/MobileDownloads";

export const dynamic = "force-dynamic";

export default async function MobileDownloadsPage() {
  const t = await getTranslations("mobilePagesB");
  const user = await requireUser();
  // Only admins run background jobs; the jobs API hides them from everyone else.
  if (!user.isEditor) redirect("/mobile");

  return (
    <div>
      <div className="mb-4 mt-1 flex items-center gap-2">
        <Link href="/mobile" className="text-dim" aria-label={t("common.back")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="text-[22px] font-black text-bright">{t("downloads.title")}</h1>
      </div>
      <MobileDownloads />
    </div>
  );
}
