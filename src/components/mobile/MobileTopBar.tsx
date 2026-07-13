import Link from "next/link";
import { getTranslations } from "next-intl/server";
import DesktopSiteLink from "./DesktopSiteLink";
import MobileJobIndicator from "./MobileJobIndicator";
import MobileNotifications from "./MobileNotifications";

// Fixed top app bar for the /mobile app: wordmark, a search entry, and the
// "Desktop site" escape. Safe-area aware for notched phones.
export default async function MobileTopBar({ avatarUrl }: { avatarUrl?: string | null }) {
  const t = await getTranslations("mobileNav.topBar");
  return (
    <header
      className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 border-b border-white/10 bg-[#12161c]/95 px-4 backdrop-blur"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <Link href="/mobile" className="text-[18px] font-black tracking-tight text-bright">
        GAME<span className="text-accent">HUB</span>
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <MobileJobIndicator />
        <MobileNotifications />
        <Link
          href="/mobile/library?focus=1"
          aria-label={t("search")}
          className="flex h-10 w-10 items-center justify-center rounded-full text-dim active:bg-white/10"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
            <circle cx="10.5" cy="10.5" r="6.5" /><line x1="15.5" y1="15.5" x2="21" y2="21" />
          </svg>
        </Link>
        <DesktopSiteLink className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-dim active:bg-white/10" />
        <Link href="/mobile/profile" aria-label={t("profile")} className="ml-1 block">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-white/15" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1f27] text-dim ring-1 ring-white/15">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.7-9 6v2h18v-2c0-3.3-4-6-9-6Z" />
              </svg>
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
