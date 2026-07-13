import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import ActivityLog from "@/components/ActivityLog";

export const dynamic = "force-dynamic";

// Admin-only live system Activity Log — what GameHub is doing and who did it.
export default async function ActivityPage() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  const t = await getTranslations("activityPages");

  return (
    <main className="mx-auto max-w-4xl px-[2.8vw] py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="text-dim hover:text-bright" aria-label={t("backToHome")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-black text-bright">{t("activityLog.title")}</h1>
          <p className="mt-0.5 text-sm text-dim">
            {t("activityLog.subtitle")}
          </p>
        </div>
      </div>
      <ActivityLog />
    </main>
  );
}
