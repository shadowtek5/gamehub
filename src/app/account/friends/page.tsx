import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import AccountFriends from "@/components/AccountFriends";

export const dynamic = "force-dynamic";

export default async function AccountFriendsPage() {
  await requireUser();
  const t = await getTranslations("accountPages.friends");
  return (
    <main className="mx-auto max-w-[1200px] px-6 py-8">
      <Link href="/account" className="text-sm text-dim transition-colors hover:text-body">
        {t("backToAccount")}
      </Link>
      <div className="mt-3">
        <AccountFriends />
      </div>
    </main>
  );
}
