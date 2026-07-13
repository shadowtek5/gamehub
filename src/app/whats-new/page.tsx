import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getAllAppNews } from "@/lib/news/appNews";
import WhatsNewFeed from "@/components/WhatsNewFeed";

export const dynamic = "force-dynamic";

// The complete GameHub changelog. The home page's What's New tab only shows the
// latest handful of entries; its "View more" tile lands here for the full list.
export default async function WhatsNewPage() {
  await requireUser();
  const items = getAllAppNews();
  const t = await getTranslations("activityPages");

  return (
    <main className="mx-auto max-w-5xl px-[2.8vw] py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="text-dim hover:text-bright" aria-label={t("backToHome")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-black text-bright">{t("whatsNew.title")}</h1>
          <p className="mt-0.5 text-sm text-dim">{t("whatsNew.subtitle")}</p>
        </div>
      </div>
      <WhatsNewFeed items={items} />
    </main>
  );
}
