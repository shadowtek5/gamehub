import { requireUser } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import Messages from "@/components/Messages";

export const dynamic = "force-dynamic";

export default async function MobileMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const user = await requireUser();
  const { to } = await searchParams;
  const t = await getTranslations("messages");
  const initialTo = to && Number.isFinite(Number(to)) ? Number(to) : undefined;
  return (
    <div>
      <h1 className="mb-3 text-[20px] font-black text-bright">{t("title")}</h1>
      <Messages currentUserId={user.id} mobile initialTo={initialTo} />
    </div>
  );
}
