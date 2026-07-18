"use client";

import Link from "next/link";
import { markBackTo } from "@/lib/scrollMemory";

// A back link for the mobile shell. Mobile Back is a plain forward <Link> push
// (game → /mobile/library, system → /mobile/systems), so it lands at scrollTop
// 0. Flagging the destination lets ScrollRestorer treat this arrival as a Back
// and restore the list's scroll position, unlike a fresh tab tap.
export default function MobileBackLink({
  href,
  className,
  "aria-label": ariaLabel,
  children,
}: {
  href: string;
  className?: string;
  "aria-label"?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      aria-label={ariaLabel}
      onClick={() => markBackTo(href)}
    >
      {children}
    </Link>
  );
}
