import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getAllAppNews } from "@/lib/news/appNews";
import WhatsNewFeed from "@/components/WhatsNewFeed";

export const dynamic = "force-dynamic";

// Mobile counterpart of /whats-new — the full changelog. Reached from the home
// What's New tab's "See all" link on the What's new in GameHub section.
export default async function MobileWhatsNewPage() {
  const t = await getTranslations("mobilePagesB");
  await requireUser();
  const items = getAllAppNews();

  return (
    <div>
      <div className="mb-4 mt-1 flex items-center gap-2">
        <Link href="/mobile" className="text-dim" aria-label={t("common.back")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="text-[22px] font-black text-bright">{t("whatsNew.title")}</h1>
      </div>
      <WhatsNewFeed items={items} />
    </div>
  );
}
