import type { MetadataRoute } from "next";

// Web app manifest → served at /manifest.webmanifest. Makes the mobile app
// installable ("Add to Home Screen") and launchable standalone (no browser
// chrome) on Android and iOS. start_url points at the mobile shell.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GameHub",
    short_name: "GameHub",
    description: "Your self-hosted retro game library",
    start_url: "/mobile",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0f14",
    theme_color: "#0e141b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
