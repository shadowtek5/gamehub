import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import ReviewBrowser from "@/components/ReviewBrowser";

export const dynamic = "force-dynamic";

// Library review / cleanup: two tabs — Unidentified games and Duplicates — with
// per-game and batch actions to find and handle them. Admin only (the actions
// hide/scrape/delete library files).
export default async function LibraryReviewPage() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/library");
  return (
    <main className="px-[2.8vw] pb-10 pt-3">
      <ReviewBrowser />
    </main>
  );
}
