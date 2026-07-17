import { requireUser } from "@/lib/auth";
import PairApproval from "@/components/PairApproval";

// Landing page an app's pairing QR points at. The user scans it on a device
// where they're signed in (requireUser redirects to /login otherwise), then
// approves — a full-screen card so it reads cleanly on a phone or a TV.
export const dynamic = "force-dynamic";

export default async function PairPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0e141b] p-5">
      <PairApproval id={id} />
    </div>
  );
}
