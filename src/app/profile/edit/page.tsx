import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getProfileUser, profileName, backgroundCandidates } from "@/lib/profile";
import { profileBadges, evaluateBadges } from "@/lib/badges";
import ProfileEdit from "@/components/ProfileEdit";

export const dynamic = "force-dynamic";

export default async function ProfileEditPage() {
  const t = await getTranslations("accountPages.profileEdit");
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
    <main className="mx-auto max-w-[1300px] px-6 py-6">
      <div className="mb-6 flex items-center gap-4">
        {user.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar_url} alt="" className="h-14 w-14 rounded object-cover" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded bg-accent/25 text-2xl font-black text-accent">
            {profileName(user).slice(0, 1).toUpperCase()}
          </span>
        )}
        <h1 className="text-2xl font-bold text-bright">
          {profileName(user)} <span className="mx-1 text-dim">»</span>
          <span className="text-xl font-semibold text-body"> {t("editProfile")}</span>
        </h1>
      </div>
      <ProfileEdit
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
    </main>
  );
}
