import { requireUser } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import Messages from "@/components/Messages";

export const dynamic = "force-dynamic";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const user = await requireUser();
  const { to } = await searchParams;
  const t = await getTranslations("messages");
  const initialTo = to && Number.isFinite(Number(to)) ? Number(to) : undefined;
  return (
    <main className="mx-auto max-w-[1000px] px-[2.8vw] py-6">
      <h1 className="mb-4 text-2xl font-black text-bright">{t("title")}</h1>
      <Messages currentUserId={user.id} initialTo={initialTo} />
    </main>
  );
}
