import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { dirFor, type Locale } from "@/i18n/locales";
import "./globals.css";
import { getSessionUser } from "@/lib/auth";
import { getDb, recentlyPlayed } from "@/lib/db";
import { compiledThemeCss } from "@/lib/themes";
import { activeAudio } from "@/lib/audiopacks";
import { platformBySlug } from "@/lib/platforms";
import AudioManager from "@/components/AudioManager";
import SystemBar from "@/components/bpm/SystemBar";
import GamepadNav from "@/components/GamepadNav";
import OnScreenKeyboard from "@/components/OnScreenKeyboard";
import LegendFooter from "@/components/bpm/LegendFooter";
import MainMenu from "@/components/MainMenu";
import SoundManager from "@/components/SoundManager";
import SteamosShim from "@/components/SteamosShim";
import ShelfScroll from "@/components/ShelfScroll";
import QuickAccess, { QuickResume } from "@/components/QuickAccess";
import CommandPalette from "@/components/CommandPalette";
import GameCardMenu from "@/components/GameCardMenu";
import RoutePathTracker from "@/components/RoutePathTracker";
import LanguageSync from "@/components/LanguageSync";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GameHub",
  description: "Your self-hosted retro game library",
  applicationName: "GameHub",
  // Installable PWA: the manifest + these icons/meta let the /mobile app be
  // added to the home screen and launch standalone on Android + iOS.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GameHub", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

// viewport-fit=cover lets the /mobile app pad around notch / home-indicator
// areas via env(safe-area-inset-*). No effect on the desktop/TV UI.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e141b",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();
  const locale = await getLocale();
  const themeCss = compiledThemeCss();
  const audio = activeAudio();
  // The /mobile app is a separate shell (its own chrome) — skip all the Big
  // Picture chrome/behaviors for it. proxy.ts provides the path.
  const isMobile = ((await headers()).get("x-gh-path") ?? "").startsWith("/mobile");

  let avatarUrl: string | null = null;
  let recent: QuickResume[] = [];
  if (user) {
    avatarUrl =
      (
        getDb().prepare("SELECT avatar_url FROM users WHERE id = ?").get(user.id) as
          | { avatar_url: string | null }
          | undefined
      )?.avatar_url ?? null;
    recent = recentlyPlayed(user.id, 6).map((r) => ({
      id: r.id,
      title: r.title,
      boxart_url: r.boxart_url,
      platform_slug: r.platform_slug,
      playable: !!platformBySlug(r.platform_slug)?.ejsCore,
    }));
  }

  return (
    <html lang={locale} dir={dirFor(locale as Locale)} className={`${geistSans.variable} h-full antialiased`}>
      {/* GamepadMode + BasicUI: Steam's stable root classes — the hooks
          deckthemes.com (CSS Loader) themes scope their rules to */}
      <body className={`GamepadMode BasicUI min-h-screen ${isMobile ? "" : "flex flex-col"}`}>
        {/* deckthemes / custom CSS — compiled from data/themes */}
        {themeCss && <style id="gh-theme-css" dangerouslySetInnerHTML={{ __html: themeCss }} />}
        {/* apply the Reduce Motion preference before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('gh-reduce-motion')==='on')document.documentElement.dataset.reduceMotion='on';}catch(e){}",
          }}
        />
        {/* i18n: makes the active locale + messages available to every server
            AND client component below (nav chrome, settings, etc.) */}
        <NextIntlClientProvider>
        {isMobile ? (
          // The /mobile layout supplies its own top/bottom chrome; render bare.
          children
        ) : (
          <>
            {user && <SystemBar username={user.username} avatarUrl={avatarUrl} />}
            {/* header is a 40px absolute overlay (BPM-style) — pages start below
                it; the footer legend is 42px fixed. BasicUiRoot/OpaqueBackground:
                Steam's gamepad-UI root + background layer theme hooks. */}
            <div className="gamepadui_BasicUiRoot_gh gamepadui_OpaqueBackground_gh flex-1 pt-10 pb-[42px]">{children}</div>
            {user && <LegendFooter />}
            {user && <MainMenu username={user.username} isAdmin={user.isAdmin} />}
            {user && (
              <QuickAccess
                isAdmin={user.isAdmin}
                username={user.username}
                avatarUrl={avatarUrl}
                recent={recent}
              />
            )}
            {user && <GameCardMenu />}
            {user && <CommandPalette mobile={false} isAdmin={user.isAdmin} />}
            <RoutePathTracker />
            <GamepadNav />
            <OnScreenKeyboard />
            <SteamosShim />
            <ShelfScroll />
          </>
        )}
        <SoundManager />
        {user && <LanguageSync />}
        {user && (
          <AudioManager
            data={{
              sound: audio.sound,
              music: audio.music,
              soundVolume: audio.config.sound_volume,
              musicVolume: audio.config.music_volume,
            }}
          />
        )}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
