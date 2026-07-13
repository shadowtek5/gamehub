import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { countVirtualCollection, VirtualDimension, VIRTUAL_DIMENSIONS } from "@/lib/db";
import MobileLibrary from "@/components/mobile/MobileLibrary";

export const dynamic = "force-dynamic";

export default async function MobileVirtualCollectionPage({
  params,
}: {
  params: Promise<{ dimension: string; value: string }>;
}) {
  await requireUser();
  const { dimension, value: rawValue } = await params;
  if (!VIRTUAL_DIMENSIONS.includes(dimension as VirtualDimension)) notFound();
  const dim = dimension as VirtualDimension;
  const value = decodeURIComponent(rawValue);
  if (countVirtualCollection(dim, value) === 0) notFound();

  return (
    <div>
      <div className="mb-4 mt-1 flex items-center gap-2">
        <Link href="/mobile/collections" className="text-dim" aria-label="Back to collections">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="truncate text-[22px] font-black text-bright">{value}</h1>
      </div>
      <MobileLibrary virtualDim={dim} virtualValue={value} />
    </div>
  );
}
