"use client";

import { useEffect, useRef, useState } from "react";

/** A muted, looping preview clip that fades in over the box art while the card
 *  is hovered (Steam / BigBox style). It loads the file only after a short hover
 *  dwell, so sweeping the mouse across a big grid never fetches dozens of clips.
 *  Rendered as an absolute overlay inside the card's cover; hover is detected on
 *  the nearest `.deck-capsule` ancestor (the card link). */
export default function HoverVideo({ src }: { src: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false); // video mounted + loading
  const [visible, setVisible] = useState(false); // faded in once actually playing

  useEffect(() => {
    const card = hostRef.current?.closest(".deck-capsule") as HTMLElement | null;
    if (!card) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const enter = () => {
      timer = setTimeout(() => setActive(true), 350);
    };
    const leave = () => {
      if (timer) clearTimeout(timer);
      setActive(false);
      setVisible(false);
    };
    card.addEventListener("pointerenter", enter);
    card.addEventListener("pointerleave", leave);
    return () => {
      if (timer) clearTimeout(timer);
      card.removeEventListener("pointerenter", enter);
      card.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div ref={hostRef} aria-hidden className="pointer-events-none absolute inset-0">
      {active && (
        <video
          src={src}
          muted
          loop
          autoPlay
          playsInline
          preload="none"
          onPlaying={() => setVisible(true)}
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            visible ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
