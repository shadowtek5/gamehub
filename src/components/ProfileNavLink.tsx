"use client";

// The header avatar. Normally navigates to the profile/account page; but when
// you're ALREADY on that page, a second tap toggles back to wherever you came
// from (falling back to the home shell if there's no in-app history — e.g. a
// deep link or fresh tab). Wraps the avatar visual passed as children.

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { closeChromeOverlays } from "@/lib/chromeOverlay";

export default function ProfileNavLink({
  href,
  fallback = "/",
  className,
  title,
  ariaLabel,
  children,
}: {
  href: string;
  /** Where to land if we try to go back but there's no in-app history. */
  fallback?: string;
  className?: string;
  title?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const onProfile = pathname === href || pathname.startsWith(`${href}/`);

  function handle(e: React.MouseEvent) {
    e.preventDefault();
    closeChromeOverlays(); // tapping the avatar dismisses any open menu/panel
    if (onProfile) {
      const from = window.location.pathname;
      router.back();
      // No history to pop (deep link / fresh tab) → go to the section home.
      window.setTimeout(() => {
        if (window.location.pathname === from) router.push(fallback);
      }, 350);
    } else {
      router.push(href);
    }
  }

  return (
    <a href={href} onClick={handle} className={className} title={title} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
