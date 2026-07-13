import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSessionUser, hasAnyUsers } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";
import SsoButton from "@/components/SsoButton";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  const firstRun = !hasAnyUsers();
  const t = await getTranslations("login");
  return (
    <main className="flex min-h-[85vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-tight text-bright">
            GAME<span className="text-accent">HUB</span>
          </h1>
          <p className="mt-2 text-sm text-dim">
            {firstRun ? t("firstRun") : t("tagline")}
          </p>
        </div>
        <Suspense fallback={null}>
          <SsoButton />
        </Suspense>
        <AuthForm firstRun={firstRun} />
      </div>
    </main>
  );
}
