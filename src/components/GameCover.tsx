"use client";

import { useEffect, useRef, useState } from "react";
import { mediaThumb } from "@/lib/media";

/**
 * Box art with graceful fallback: if the thumbnail 404s, render a generated
 * gradient cover with the title. The image fades in on decode over the solid
 * placeholder so it eases in instead of flashing; an already-cached image (e.g.
 * scrolling back to a row) shows instantly with no fade.
 */
export default function GameCover({
  title,
  boxartUrl,
  color = "#2a475e",
  shortName,
  className = "",
  fit = "cover",
  thumbWidth,
  eager = false,
}: {
  title: string;
  boxartUrl: string | null;
  color?: string;
  shortName?: string;
  className?: string;
  /** contain = letterbox full art (uniform mixed-system grids) */
  fit?: "cover" | "contain";
  /** request a right-sized WebP this many px wide instead of the full cover */
  thumbWidth?: number;
  /** load immediately (grid rows are already gated by virtualization) rather
   *  than waiting for lazy intersection — avoids a just-in-time pop-in */
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const src = thumbWidth ? mediaThumb(boxartUrl, thumbWidth) : boxartUrl;

  // A new URL (fresh scrape, new ?v= stamp) gets a fresh chance — without this
  // a card that ever failed stays a gradient until a full page reload.
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [boxartUrl]);

  // If the browser already has the image (complete on mount), skip the fade so
  // revisits / scroll-backs don't re-animate.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setLoaded(true);
  }, [src]);

  if (!boxartUrl || failed) {
    return (
      <div
        className={`libraryassetimage_GreyBackground_gh relative flex items-center justify-center overflow-hidden ${className}`}
        style={{
          background: `linear-gradient(160deg, ${color}cc 0%, #0e141b 130%)`,
        }}
      >
        <span className="libraryassetimage_Title_gh px-3 text-center text-sm font-bold text-white/90 leading-snug [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {title}
        </span>
        {shortName && (
          <span className="absolute bottom-1.5 right-1.5 text-[9px] font-bold uppercase tracking-wider text-white/50">
            {shortName}
          </span>
        )}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src ?? undefined}
      alt={title}
      loading={eager ? "eager" : "lazy"}
      // fetchPriority is a valid DOM attribute in React 19 / Next 16
      fetchPriority={eager ? "high" : "auto"}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      // SteamOS module-style hooks for CSS themes (cover image inside the asset container)
      className={`libraryassetimage_PortraitImage_gh appportrait_PortraitImage_gh ${
        fit === "contain" ? "object-contain" : "object-cover"
      } transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
    />
  );
}
