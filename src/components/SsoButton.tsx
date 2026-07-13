"use client";

// "Sign in with …" button on the login page — only appears when an OIDC
// provider is enabled in Settings. Also surfaces ?error= from failed flows.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

export default function SsoButton() {
  const t = useTranslations("auth.ssoButton");
  const [sso, setSso] = useState<{ enabled: boolean; label: string } | null>(null);
  const search = useSearchParams();
  const error = search.get("error");

  useEffect(() => {
    fetch("/api/auth/oidc/status")
      .then((r) => r.json())
      .then(setSso)
      .catch(() => {});
  }, []);

  return (
    <>
      {error && (
        <p className="mb-3 rounded bg-[#5c2b2b]/60 px-3 py-2 text-center text-sm text-[#ffb3b3]">
          {error}
        </p>
      )}
      {sso?.enabled && (
        <>
          <a
            href="/api/auth/oidc/login"
            className="btn-gray block w-full px-4 py-3 text-center text-[15px]"
          >
            {t("signInWith", { label: sso.label })}
          </a>
          <div className="my-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-dim">
            <span className="h-px flex-1 bg-white/10" />
            {t("or")}
            <span className="h-px flex-1 bg-white/10" />
          </div>
        </>
      )}
    </>
  );
}
