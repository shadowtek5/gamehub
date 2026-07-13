import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getMobileSettingsSections } from "../sections";

export const dynamic = "force-dynamic";

export default async function MobileSettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const t = await getTranslations("mobileSettings");
  const user = await requireUser();
  if (!user.isAdmin) redirect("/mobile");
  const { section } = await params;
  const sections = await getMobileSettingsSections(user);
  const current = sections.find((s) => s.key === section);
  if (!current) notFound();

  return (
    <div>
      <div className="mb-4 mt-1 flex items-center gap-2">
        <Link href="/mobile/settings" className="text-dim" aria-label={t("section.back")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="text-[22px] font-black text-bright">{current.label}</h1>
      </div>
      <div className="gh-msettings flex flex-col gap-6">{current.content}</div>
    </div>
  );
}
