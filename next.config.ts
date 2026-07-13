import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// i18n: no URL-routing mode — locale comes from the gh-locale cookie, resolved
// in src/i18n/request.ts. See src/i18n/locales.ts for the supported set.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module and must not be bundled
  serverExternalPackages: ["better-sqlite3"],
  // Hide the on-screen dev indicator overlay
  devIndicators: false,
  // Self-contained server bundle for the Docker image only — `next start`
  // (the native workflow) refuses to run with standalone output
  ...(process.env.BUILD_STANDALONE ? { output: "standalone" as const } : {}),
};

export default withNextIntl(nextConfig);
