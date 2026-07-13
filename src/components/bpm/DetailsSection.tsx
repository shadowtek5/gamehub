import type { ReactNode } from "react";

// SteamOS app-details section chrome, rebuilt 1:1 from the live Deck
// (413150 → Your Stuff). Every section shares this structure so deckthemes CSS
// applies and the whole tab reads as if Steam built it:
//   h2  appdetailssectionheader_SectionHeader / _PadLeft   (18px)
//     appdetailssectionheader_Label
//       appdetailssectionheader_LabelText                  (18px / 500, mb 10px)
//   appdetailssection_AppDetailsSectionContainer / _HasLabel / _RightColumnSection
//     bg rgba(103,112,123,0.2)                             (the tinted panel)
//       [ optional appdetailssection_Highlight  bg #23262e ]
//       appdetailssection_Body  padding 10px
//
// The Body wrapper is opt-in (`bodyless`) so callers whose child already renders
// its own appdetailssection_Body (e.g. MediaGallery) don't double-pad.

export function SectionBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`appdetailssection_Body_gh p-[10px] ${className}`}>{children}</div>;
}

export function SectionHighlight({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`appdetailssection_Highlight_gh flex items-center gap-5 bg-[#23262e] p-[10px] ${className}`}>
      {children}
    </div>
  );
}

export default function DetailsSection({
  title,
  headerRight,
  children,
  bodyless = false,
  containerClassName = "",
}: {
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
  /** Skip the padded Body wrapper (child renders its own). */
  bodyless?: boolean;
  containerClassName?: string;
}) {
  return (
    <section className="appdetailssection_AppDetailsSection_gh">
      <h2 className="appdetailssectionheader_SectionHeader_gh appdetailssectionheader_PadLeft_gh flex items-center overflow-hidden">
        <span className="appdetailssectionheader_Label_gh flex items-center">
          <span className="appdetailssectionheader_LabelText_gh mb-[10px] text-[18px] font-medium leading-[22px] text-white">
            {title}
          </span>
        </span>
        {headerRight ? (
          <span className="mb-[10px] ml-auto flex items-center text-[13px]">{headerRight}</span>
        ) : null}
      </h2>
      <div
        className={`appdetailssection_AppDetailsSectionContainer_gh appdetailssection_AppDetailsSectionHasLabel_gh appdetailssection_RightColumnSection_gh overflow-hidden bg-[rgba(103,112,123,0.2)] ${containerClassName}`}
      >
        {bodyless ? children : <SectionBody>{children}</SectionBody>}
      </div>
    </section>
  );
}
