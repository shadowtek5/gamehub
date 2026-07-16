import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import {
  getDb,
  getLibraryPaths,
  getSystemFolders,
  getHiddenSystems,
  getSetting,
} from "@/lib/db";
import { PLATFORMS } from "@/lib/platforms";
import MaintenancePanel from "@/components/MaintenancePanel";
import BackupPanel from "@/components/BackupPanel";
import SetIntegrity from "@/components/bpm/SetIntegrity";
import AppearancePanel from "@/components/AppearancePanel";
import SettingsSystem from "@/components/bpm/SettingsSystem";
import SettingsAudio from "@/components/bpm/SettingsAudio";
import SettingsController from "@/components/bpm/SettingsController";
import SettingsKeyboard from "@/components/bpm/SettingsKeyboard";
import SettingsAccessibility from "@/components/bpm/SettingsAccessibility";
import SettingsInGame from "@/components/bpm/SettingsInGame";
import SettingsStorage from "@/components/bpm/SettingsStorage";
import { getSystemDisplayMap } from "@/lib/systemArt";
import SettingsInternet from "@/components/bpm/SettingsInternet";
import SettingsLaunchBox from "@/components/bpm/SettingsLaunchBox";
import SettingsDatDb from "@/components/bpm/SettingsDatDb";
import SettingsNews from "@/components/bpm/SettingsNews";
import SettingsAutomation from "@/components/bpm/SettingsAutomation";
import SettingsUsers from "@/components/bpm/SettingsUsers";
import {
  getScraperOptions,
  screenscraperConfigured,
  emumoviesConfigured,
  igdbConfigured,
  mobygamesConfigured,
  steamgriddbConfigured,
  thegamesdbConfigured,
} from "@/lib/providers/config";
import { launchboxConfigured } from "@/lib/providers/launchbox";
import ScraperOptionsPanel from "@/components/ScraperOptions";
import ReportsPanel from "@/components/ReportsPanel";
import BulkScrape from "@/components/BulkScrape";
import SettingsShell from "@/components/SettingsShell";
import InvitesPanel from "@/components/InvitesPanel";
import OidcSettings from "@/components/OidcSettings";
import { listUsersAdmin, presentSystemSlugs, listRestrictionProfiles } from "@/lib/db";
import { platformBySlug } from "@/lib/platforms";
import SettingsAgeRestrictions from "@/components/bpm/SettingsAgeRestrictions";
import SettingsLanguage from "@/components/bpm/SettingsLanguage";
import ActivityLog from "@/components/ActivityLog";
import { getOidcConfig } from "@/lib/oidc";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  const t = await getTranslations("settings.sections");

  const db = getDb();
  const paths = getLibraryPaths();
  const stats = db
    .prepare(
      `SELECT platform_slug, COUNT(*) AS count FROM roms WHERE missing = 0
       GROUP BY platform_slug ORDER BY count DESC`
    )
    .all() as { platform_slug: string; count: number }[];

  // Configured, non-hidden systems present in the library — the choose-systems
  // list shared by the game scrape and the system-info scrape.
  const scrapeSystems = (() => {
    const configured = new Set(getSystemFolders().map((f) => f.platform_slug));
    const hidden = getHiddenSystems();
    return stats
      .filter((s) => configured.has(s.platform_slug) && !hidden.has(s.platform_slug))
      .map((s) => ({
        slug: s.platform_slug,
        name: PLATFORMS.find((p) => p.slug === s.platform_slug)?.name ?? s.platform_slug,
        count: s.count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  return (
    // shell is a fixed full-viewport surface (spans under the header);
    // no flow wrapper offset needed
    <main>
      <SettingsShell
        sections={[
          // GameHub settings — Steam Big Picture LOOK, but categories renamed
          // and reorganized to fit a ROM library (Steam-only categories like
          // Friends/Cloud/Store are dropped; scraping is consolidated).
          {
            key: "system",
            label: t("system"),
            icon: "🖳",
            content: <SettingsSystem />,
          },
          {
            key: "library",
            label: t("library"),
            icon: "▤",
            content: (
              <SettingsStorage
                initialPaths={paths}
                initialSystemFolders={getSystemFolders()}
                gameCounts={Object.fromEntries(
                  stats.map((s) => [s.platform_slug, s.count])
                )}
                initialHidden={[...getHiddenSystems()]}
                systemDisplay={getSystemDisplayMap()}
              />
            ),
          },
          {
            key: "maintenance",
            label: t("maintenance"),
            icon: "🔧",
            content: (
              <>
                <MaintenancePanel
                  initialAutoScan={getSetting("auto_scan") !== "off"}
                  initialAutoCleanup={getSetting("auto_cleanup") === "on"}
                  initialFsWatcher={getSetting("fs_watcher") === "on"}
                  lastAutoScan={getSetting("last_auto_scan")}
                  systems={scrapeSystems}
                />
                <SetIntegrity />
                <BackupPanel />
              </>
            ),
          },
          {
            key: "scraping",
            label: t("scraping"),
            icon: "🌐",
            content: (
              <>
                <ScraperOptionsPanel
                  initial={getScraperOptions()}
                  configured={{
                    screenscraper: screenscraperConfigured(),
                    emumovies: emumoviesConfigured(),
                    igdb: igdbConfigured(),
                    mobygames: mobygamesConfigured(),
                    thegamesdb: thegamesdbConfigured(),
                    steamgriddb: steamgriddbConfigured(),
                    launchbox: launchboxConfigured(),
                    libretro: true,
                  }}
                />
                <BulkScrape systems={scrapeSystems} />
              </>
            ),
          },
          {
            key: "providers",
            label: t("providers"),
            icon: "☁",
            content: (
              <>
                <SettingsInternet />
                <SettingsLaunchBox />
                <SettingsDatDb />
              </>
            ),
          },
          { key: "firmware", label: t("firmware"), icon: "▶", content: <SettingsInGame /> },
          { key: "news", label: t("news"), icon: "📰", content: <SettingsNews /> },
          { key: "automation", label: t("automation"), icon: "⏱", content: <SettingsAutomation /> },
          { key: "reports", label: t("reports"), icon: "📊", content: <ReportsPanel /> },
          { key: "activity", label: t("activity"), icon: "📜", content: <ActivityLog /> },
          "divider",
          { key: "customization", label: t("customization"), icon: "🎨", content: <AppearancePanel /> },
          { key: "audio", label: t("audio"), icon: "🔊", content: <SettingsAudio isAdmin /> },
          { key: "controller", label: t("controller"), icon: "🎮", content: <SettingsController /> },
          { key: "keyboard", label: t("keyboard"), icon: "⌨", content: <SettingsKeyboard /> },
          { key: "accessibility", label: t("accessibility"), icon: "♿", content: <SettingsAccessibility /> },
          { key: "language", label: t("language"), icon: "🌐", content: <SettingsLanguage /> },
          "divider",
          {
            key: "users",
            label: t("users"),
            icon: "👥",
            content: (
              <>
                <SettingsUsers
                  initialUsers={listUsersAdmin()}
                  currentUserId={user.id}
                  profiles={listRestrictionProfiles().map((p) => ({ id: p.id, name: p.name }))}
                />
                <InvitesPanel />
                <OidcSettings initial={getOidcConfig()} />
              </>
            ),
          },
          {
            key: "age-restrictions",
            label: t("ageRestrictions"),
            icon: "🔞",
            content: (
              <SettingsAgeRestrictions
                initialProfiles={listRestrictionProfiles()}
                systems={presentSystemSlugs()
                  .map((slug) => ({ slug, name: platformBySlug(slug)?.name ?? slug }))
                  .sort((a, b) => a.name.localeCompare(b.name))}
              />
            ),
          },
        ]}
      />
    </main>
  );
}
