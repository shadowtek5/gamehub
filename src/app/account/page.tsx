import { requireUser } from "@/lib/auth";
import { getProfileUser, profileName } from "@/lib/profile";
import { listFriends, listIncomingRequests } from "@/lib/db";
import AccountPanel from "@/components/AccountPanel";
import ApiTokens from "@/components/ApiTokens";
import RetroAchievementsLink from "@/components/RetroAchievementsLink";
import FriendsSummaryLink from "@/components/FriendsSummaryLink";
import LanguageCard from "@/components/LanguageCard";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await requireUser();
  const user = getProfileUser(session.id)!;
  const friends = listFriends(user.id);
  const incoming = listIncomingRequests(user.id).length;
  const online = friends.filter((f) => f.presence === "online").length;

  return (
    <main className="px-6 py-8">
      <AccountPanel
        user={{
          id: user.id,
          username: user.username,
          name: profileName(user),
          avatar_url: user.avatar_url,
          status: user.status ?? "online",
        }}
      />
      <div className="mx-auto mt-2.5 max-w-[1200px]">
        <FriendsSummaryLink href="/account/friends" friends={friends.length} online={online} incoming={incoming} />
      </div>
      <div className="mx-auto mt-2.5 max-w-[1200px]">
        <RetroAchievementsLink />
      </div>
      <div className="mx-auto mt-2.5 max-w-[1200px]">
        <LanguageCard />
      </div>
      <div className="mx-auto mt-2.5 max-w-[1200px]">
        <ApiTokens />
      </div>
    </main>
  );
}
