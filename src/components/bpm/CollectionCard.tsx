"use client";

// Big Picture collection card (reference: BPM library → Collections tab,
// measured live). A 185×185 square with a 3D "display case" — a tilted flex
// row of the collection's covers (matrix3d, orthographic) — over a #313d53
// base, the name + "( count )" centered in the lower half, and a ⚡ badge in
// the corner for smart/dynamic collections. Exact allcollections_* hooks so
// deckthemes CSS applies.

import clsx from "clsx";
import { useTranslations } from "next-intl";

// The exact display-case rotation Steam applies to the cover row.
const CASE_MATRIX =
  "matrix3d(0.769751, -0.538986, -0.34202, 0, 0.634808, 0.702655, 0.321394, 0, 0.0670957, -0.46451, 0.883022, 0, 0, 0, 0, 1)";

export default function CollectionCard({
  name,
  count,
  covers,
  smart = false,
  onClick,
}: {
  name: string;
  count: number;
  covers: string[];
  smart?: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations("collectionsComps.card");
  // The case shows up to three covers, nearest first (Steam's layout).
  const shown = covers.slice(0, 3);
  return (
    <button
      onClick={onClick}
      title={name}
      className={clsx(
        "allcollections_Collection_gh deck-capsule Focusable relative block h-[185px] w-[185px] shrink-0",
        "overflow-hidden rounded-[3px] bg-[#313d53] text-left"
      )}
    >
      {/* 3D display case of covers */}
      <div className="allcollections_CollectionImage_gh absolute inset-0 overflow-hidden">
        {shown.length > 0 && (
          <div
            className="allcollections_DisplayCaseContainerBounds_gh absolute"
            style={{ top: -61, left: -102, width: 388, height: 307 }}
          >
            <div
              className="allcollections_DisplayCaseContainer_gh flex"
              style={{
                width: 357,
                height: 169,
                transform: CASE_MATRIX,
                transformOrigin: "178px 84px",
                transformStyle: "preserve-3d",
              }}
            >
              {shown.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  className="allcollections_CapsuleImage_gh shrink-0 object-cover"
                  style={{ width: 177, height: 163, boxShadow: "-8px 14px 12px rgba(0,0,0,0.6)" }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* darken the lower half so the label stays legible over any art */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

      {/* name + ( count ), centered in the lower portion */}
      <div
        className="allcollections_CollectionLabel_gh absolute left-2 right-2 text-center"
        style={{ top: 96, bottom: 16, padding: 12 }}
      >
        <div className="line-clamp-2 text-[18px] font-medium leading-tight text-white [text-shadow:0_2px_6px_rgba(0,0,0,0.75)]">
          {name}
        </div>
        <div className="allcollections_CollectionLabelCount_gh mt-0.5 text-[16px] text-white/[0.667] [text-shadow:0_1px_4px_rgba(0,0,0,0.7)]">
          ( {count.toLocaleString()} )
        </div>
      </div>

      {smart && (
        <span
          className="allcollections_DynamicCollection_gh absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-[4px] bg-black/[0.467] text-[14px] text-white"
          title={t("smartTitle")}
        >
          ⚡
        </span>
      )}
    </button>
  );
}
