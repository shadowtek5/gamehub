"use client";

// Library "Collections" tab — 1:1 with Big Picture's Collections view: a grid
// of 185px display-case cards (22px gap, left-aligned), each opening that
// collection's grid in place.

import CollectionCard from "./bpm/CollectionCard";
import type { LibraryCollectionTab } from "@/lib/db";
import { useTranslations } from "next-intl";

export default function CollectionShelves({
  collections,
  onOpen,
}: {
  collections: LibraryCollectionTab[];
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("collectionsComps.shelves");
  if (collections.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-[17px] text-body">{t("emptyTitle")}</p>
        <p className="mt-2 text-[14px] text-dim">
          {t("emptyHint")}
        </p>
      </div>
    );
  }
  return (
    <div
      className="mt-4 grid justify-start gap-[22px]"
      style={{ gridTemplateColumns: "repeat(auto-fill, 185px)" }}
    >
      {collections.map((c) => (
        <CollectionCard
          key={c.id}
          name={c.name}
          count={c.count}
          covers={c.covers}
          smart={c.is_smart === 1}
          onClick={() => onOpen(String(c.id))}
        />
      ))}
    </div>
  );
}
