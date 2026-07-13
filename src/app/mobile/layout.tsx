import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import MobileTopBar from "@/components/mobile/MobileTopBar";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";
import PwaRegister from "@/components/mobile/PwaRegister";

export const dynamic = "force-dynamic";

// The /mobile app shell: a fixed top bar and bottom tab nav (conventional
// mobile), with the content scrolling between them. Dark Steam-style skin, but
// none of the Big Picture chrome (the root layout skips that for /mobile).
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const avatarUrl =
    (
      getDb().prepare("SELECT avatar_url FROM users WHERE id = ?").get(user.id) as
        | { avatar_url: string | null }
        | undefined
    )?.avatar_url ?? null;

  return (
    <div className="min-h-[100dvh] bg-[var(--bg)] text-body">
      <MobileTopBar avatarUrl={avatarUrl} />
      <main
        className="mx-auto w-full max-w-[720px] overflow-x-hidden px-4"
        style={{
          paddingTop: "calc(3.5rem + env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px) + 12px)",
        }}
      >
        {children}
      </main>
      <MobileBottomNav showDownloads={user.isEditor} />
      <PwaRegister />
    </div>
  );
}
