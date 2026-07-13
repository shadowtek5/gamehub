"use client";

// Drag-to-scroll for horizontal shelves: click-hold and drag scrolls,
// with click suppression so a drag over a card doesn't open it.
// (The mouse wheel is left alone — it scrolls the page as normal.)

import { useEffect } from "react";

export default function ShelfScroll() {
  useEffect(() => {
    let dragEl: HTMLElement | null = null;
    let startX = 0;
    let startScroll = 0;
    let dragged = false;
    let suppressClickUntil = 0;

    function onDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const el = (e.target as HTMLElement)?.closest?.(
        ".no-scrollbar"
      ) as HTMLElement | null;
      if (!el || el.scrollWidth <= el.clientWidth + 4) return;
      dragEl = el;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      dragged = false;
    }

    function onMove(e: MouseEvent) {
      if (!dragEl) return;
      const dx = e.clientX - startX;
      if (!dragged && Math.abs(dx) > 6) {
        dragged = true;
        dragEl.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
      if (dragged) {
        e.preventDefault();
        dragEl.scrollLeft = startScroll - dx;
      }
    }

    function onUp() {
      if (dragEl) {
        dragEl.style.cursor = "";
        document.body.style.userSelect = "";
        if (dragged) suppressClickUntil = Date.now() + 80;
      }
      dragEl = null;
      dragged = false;
    }

    function onClick(e: MouseEvent) {
      if (Date.now() < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    function onDragStart(e: DragEvent) {
      if (dragEl) e.preventDefault();
    }

    window.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("click", onClick, { capture: true });
    window.addEventListener("dragstart", onDragStart);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("dragstart", onDragStart);
    };
  }, []);

  return null;
}
