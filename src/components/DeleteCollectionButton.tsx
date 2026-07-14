"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GpButton, GpConfirm } from "@/components/bpm/primitives";
import { useTranslations } from "next-intl";

export default function DeleteCollectionButton({
  collectionId,
  redirectTo = "/collections",
}: {
  collectionId: number;
  /** Where to go after deleting (mobile passes /mobile/collections). */
  redirectTo?: string;
}) {
  const t = useTranslations("collectionsComps.deleteButton");
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  async function remove() {
    const res = await fetch(`/api/collections/${collectionId}`, { method: "DELETE" });
    if (res.ok) {
      router.push(redirectTo);
      router.refresh();
    }
  }

  return (
    <>
      <GpButton
        onClick={() => setConfirming(true)}
        className="!bg-[#a33a3a] text-sm hover:!bg-[#c04545]"
      >
        {t("deleteCollection")}
      </GpButton>
      {confirming && (
        <GpConfirm
          title={t("confirmTitle")}
          confirmLabel={t("confirmLabel")}
          danger
          onConfirm={() => void remove()}
          onClose={() => setConfirming(false)}
        >
          {t("confirmBody")}
        </GpConfirm>
      )}
    </>
  );
}
