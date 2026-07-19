import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import MobileReview from "@/components/mobile/MobileReview";

export const dynamic = "force-dynamic";

export default async function MobileReviewPage() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/mobile/library");
  const t = await getTranslations("libraryReview");
  return (
    <div>
      <div className="mb-3 mt-1 flex items-center gap-2">
        <Link href="/mobile/library" className="text-dim" aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="text-[22px] font-black text-bright">{t("title")}</h1>
      </div>
      <MobileReview />
    </div>
  );
}
