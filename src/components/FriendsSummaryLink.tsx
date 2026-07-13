// Compact, server-rendered entry point to the dedicated Friends page. Replaces
// the inline friends manager on the Account / mobile Profile screens: shows the
// friend count, how many are online, and a pending-request badge.

import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function FriendsSummaryLink({
  href,
  friends,
  online,
  incoming,
}: {
  href: string;
  friends: number;
  online: number;
  incoming: number;
}) {
  const t = await getTranslations("accountComps.summary");
  return (
    <Link
      href={href}
      className="panel flex items-center justify-between p-5 transition-colors hover:bg-white/5 sm:p-6"
    >
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent ring-1 ring-white/10">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            <path d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8v-1c0-3 3-5 7-5s7 2 7 5v1H2Zm17-9h4m-2-2v4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold uppercase tracking-widest text-bright">{t("title")}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[13px] text-dim">
            <span>
              {t("friendCount", { count: friends })}
            </span>
            {online > 0 && (
              <span className="flex items-center gap-1 text-[#57cbde]">
                <span className="h-2 w-2 rounded-full bg-[#57cbde]" />
                {t("onlineCount", { count: online })}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {incoming > 0 && (
          <span className="rounded-full bg-accent px-2.5 py-1 text-[12px] font-bold text-black">
            {t("requestCount", { count: incoming })}
          </span>
        )}
        <span className="text-lg text-dim" aria-hidden>
          ›
        </span>
      </div>
    </Link>
  );
}
