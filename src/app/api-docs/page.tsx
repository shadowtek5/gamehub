import { requireUser } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import SwaggerDocs from "@/components/SwaggerDocs";

export const dynamic = "force-dynamic";

export default async function ApiDocsPage() {
  await requireUser();
  const t = await getTranslations("apiDocs");
  return (
    <main className="px-6 py-8">
      <div className="mx-auto mb-5 max-w-[1200px]">
        <h1 className="text-2xl font-black text-bright">{t("title")}</h1>
        <p className="mt-1 text-sm text-dim">
          {t("authorizeIntro")}{" "}
          <a href="/account" className="text-accent hover:underline">
            {t("accountPageLink")}
          </a>{" "}
          {t("authorizeOutro")}
        </p>
      </div>
      <SwaggerDocs />
    </main>
  );
}
