import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/db";
import SetupWizard from "@/components/SetupWizard";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const user = await requireUser();
  // Admin-only, and sticky: saving the library step (or testing providers)
  // must NOT bounce you back to the library mid-wizard — only explicitly
  // finishing or skipping the wizard (setup_complete) closes it.
  if (!user.isAdmin || getSetting("setup_complete") === "on") redirect("/");

  // Remember that the admin has now seen the wizard, so the home page stops
  // force-redirecting here on every visit. They can always return manually
  // until setup_complete is set; the home page keeps an empty-library nudge.
  setSetting("setup_prompted", "on");

  return (
    <main className="flex min-h-[85vh] items-center justify-center px-4 py-10">
      <SetupWizard username={user.username} />
    </main>
  );
}
