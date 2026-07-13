import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LOCALE_COOKIE, matchAcceptLanguage } from "@/i18n/locales";

// Next 16 renamed `middleware` → `proxy` (Node runtime by default).
// Three jobs:
//   1. Auto-send phone visitors to the /mobile app (with a remembered
//      "Desktop site" escape via the gh-view cookie).
//   2. Expose the request path to the root layout (x-gh-path header) so it can
//      render the mobile shell vs the Big Picture chrome without a client flash.
//   3. On the first visit (no gh-locale cookie), negotiate a UI language from
//      the Accept-Language header and remember it. The in-app switcher and the
//      per-user DB preference (via LanguageSync) can later overwrite it.

const PHONE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini|IEMobile/i;

// Desktop-app sections that have a /mobile equivalent. Phone users hitting
// these (or their subpaths) get redirected to the mobile app.
const REDIRECT_PREFIXES = ["/library", "/systems", "/collections", "/game", "/play", "/settings"];

function hasMobileEquivalent(pathname: string): boolean {
  if (pathname === "/") return true;
  return REDIRECT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const view = request.cookies.get("gh-view")?.value; // "desktop" | "mobile" | undefined
  const isPhone = PHONE_UA.test(request.headers.get("user-agent") ?? "");
  const wantsMobile = view === "mobile" || (isPhone && view !== "desktop");

  // First-visit locale negotiation. Only set when absent so the switcher /
  // LanguageSync remain authoritative afterwards; falls back to the default
  // locale (English) when Accept-Language has no supported match.
  const hasLocaleCookie = !!request.cookies.get(LOCALE_COOKIE)?.value;
  const detectedLocale = hasLocaleCookie
    ? null
    : matchAcceptLanguage(request.headers.get("accept-language"));
  const rememberLocale = (res: NextResponse) => {
    if (detectedLocale) {
      res.cookies.set(LOCALE_COOKIE, detectedLocale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
    return res;
  };

  if (wantsMobile && !pathname.startsWith("/mobile") && hasMobileEquivalent(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/mobile" : `/mobile${pathname}`;
    return rememberLocale(NextResponse.redirect(url));
  }

  // Pass the path to the server layout so it can pick the right shell.
  const headers = new Headers(request.headers);
  headers.set("x-gh-path", pathname);
  return rememberLocale(NextResponse.next({ request: { headers } }));
}

export const config = {
  // Everything except API routes, Next internals, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
