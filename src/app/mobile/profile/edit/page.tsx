import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getProfileUser, backgroundCandidates } from "@/lib/profile";
import { profileBadges, evaluateBadges } from "@/lib/badges";
import ProfileEdit from "@/components/ProfileEdit";

export const dynamic = "force-dynamic";

export default async function MobileProfileEditPage() {
  const t = await getTranslations("mobilePagesC.profileEdit");
  const session = await requireUser();
  const user = getProfileUser(session.id)!;
  try {
    evaluateBadges({ id: user.id, isAdmin: session.isAdmin });
  } catch {
    /* ignore */
  }
  const { badges } = profileBadges(user.id);
  const backgrounds = backgroundCandidates(user.id);

  return (
    <div>
      <div className="mb-4 mt-1 flex items-center gap-2">
        <Link href="/mobile/profile" className="text-dim" aria-label={t("backToProfile")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="text-[22px] font-black text-bright">{t("title")}</h1>
      </div>
      <ProfileEdit
        backHref="/mobile/profile"
        user={{
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          real_name: user.real_name,
          location: user.location,
          avatar_url: user.avatar_url,
          background_url: user.background_url,
          theme: user.theme,
          featured_badge: user.featured_badge,
        }}
        badges={badges}
        backgrounds={backgrounds}
      />
    </div>
  );
}
