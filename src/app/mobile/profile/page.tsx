import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getProfileUser, profileName } from "@/lib/profile";
import { listFriends, listIncomingRequests } from "@/lib/db";
import MobileAccount from "@/components/mobile/MobileAccount";
import MobileApiTokens from "@/components/mobile/MobileApiTokens";
import MobileRetroAchievements from "@/components/mobile/MobileRetroAchievements";
import FriendsSummaryLink from "@/components/FriendsSummaryLink";
import LanguageCard from "@/components/LanguageCard";

export const dynamic = "force-dynamic";

export default async function MobileProfilePage() {
  const t = await getTranslations("mobilePagesC.profile");
  const session = await requireUser();
  const user = getProfileUser(session.id)!;
  const friends = listFriends(user.id);
  const incoming = listIncomingRequests(user.id).length;
  const online = friends.filter((f) => f.presence === "online").length;

  return (
    <div>
      <h1 className="mb-4 mt-1 text-[22px] font-black text-bright">{t("title")}</h1>
      <MobileAccount
        user={{
          id: user.id,
          username: user.username,
          name: profileName(user),
          avatar_url: user.avatar_url,
          status: user.status ?? "online",
        }}
      />
      <div className="mt-3">
        <FriendsSummaryLink
          href="/mobile/profile/friends"
          friends={friends.length}
          online={online}
          incoming={incoming}
        />
      </div>
      <div className="mt-3">
        <MobileRetroAchievements />
      </div>
      <div className="mt-3">
        <LanguageCard />
      </div>
      <div className="mt-3">
        <MobileApiTokens />
      </div>
    </div>
  );
}
