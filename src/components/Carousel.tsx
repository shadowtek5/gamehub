"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";

export default function Carousel({
  title,
  href,
  children,
}: {
  title: string;
  /** Optional link target for the row title (e.g. a system page) */
  href?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("shelves.carousel");
  const scroller = useRef<HTMLDivElement>(null);

  function scrollBy(dir: number) {
    scroller.current?.scrollBy({ left: dir * 640, behavior: "smooth" });
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-bright">
          {href ? (
            <a href={href} className="transition-colors hover:text-accent">
              {title} <span className="text-dim">›</span>
            </a>
          ) : (
            title
          )}
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => scrollBy(-1)}
            className="btn-gray h-7 w-7 cursor-pointer text-sm leading-none"
            aria-label={t("scrollLeft")}
          >
            ‹
          </button>
          <button
            onClick={() => scrollBy(1)}
            className="btn-gray h-7 w-7 cursor-pointer text-sm leading-none"
            aria-label={t("scrollRight")}
          >
            ›
          </button>
        </div>
      </div>
      <div
        ref={scroller}
        className="no-scrollbar flex gap-3 overflow-x-auto pb-2 pt-1"
      >
        {children}
      </div>
    </section>
  );
}
