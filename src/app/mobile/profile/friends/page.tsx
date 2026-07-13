import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import AccountFriends from "@/components/AccountFriends";

export const dynamic = "force-dynamic";

export default async function MobileFriendsPage() {
  await requireUser();
  const t = await getTranslations("mobilePagesC.friends");
  return (
    <div className="pb-6">
      <Link href="/mobile/profile" className="text-sm text-dim transition-colors hover:text-body">
        {t("backProfile")}
      </Link>
      <h1 className="mb-3 mt-2 text-[22px] font-black text-bright">{t("title")}</h1>
      <AccountFriends hrefBase="/mobile/profile" />
    </div>
  );
}
