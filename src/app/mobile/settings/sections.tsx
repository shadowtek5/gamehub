import { getTranslations } from "next-intl/server";
import {
  getDb,
  getLibraryPaths,
  getSystemFolders,
  getHiddenSystems,
  getSetting,
  listUsersAdmin,
  listRestrictionProfiles,
  presentSystemSlugs,
} from "@/lib/db";
import { PLATFORMS, platformBySlug } from "@/lib/platforms";
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
import { getOidcConfig } from "@/lib/oidc";
import { getSystemDisplayMap } from "@/lib/systemArt";
import type { SessionUser } from "@/lib/auth";
import MaintenancePanel from "@/components/MaintenancePanel";
import SetIntegrity from "@/components/bpm/SetIntegrity";
import BackupPanel from "@/components/BackupPanel";
import SettingsNews from "@/components/bpm/SettingsNews";
import ReportsPanel from "@/components/ReportsPanel";
import AppearancePanel from "@/components/AppearancePanel";
import SettingsSystem from "@/components/bpm/SettingsSystem";
import SettingsAudio from "@/components/bpm/SettingsAudio";
import SettingsController from "@/components/bpm/SettingsController";
import SettingsKeyboard from "@/components/bpm/SettingsKeyboard";
import SettingsAccessibility from "@/components/bpm/SettingsAccessibility";
import SettingsLanguage from "@/components/bpm/SettingsLanguage";
import SettingsInGame from "@/components/bpm/SettingsInGame";
import SettingsStorage from "@/components/bpm/SettingsStorage";
import SettingsInternet from "@/components/bpm/SettingsInternet";
import SettingsLaunchBox from "@/components/bpm/SettingsLaunchBox";
import SettingsDatDb from "@/components/bpm/SettingsDatDb";
import SettingsAutomation from "@/components/bpm/SettingsAutomation";
import SettingsUsers from "@/components/bpm/SettingsUsers";
import SettingsAgeRestrictions from "@/components/bpm/SettingsAgeRestrictions";
import ScraperOptionsPanel from "@/components/ScraperOptions";
import BulkScrape from "@/components/BulkScrape";
import InvitesPanel from "@/components/InvitesPanel";
import OidcSettings from "@/components/OidcSettings";
import ActivityLog from "@/components/ActivityLog";

export interface MobileSettingsSection {
  key: string;
  label: string;
  icon: string;
  blurb: string;
  content: React.ReactNode;
}

/** The mobile settings categories — same panels as the desktop shell, assembled
 *  once and consumed by both the list page and the per-category screen. */
export async function getMobileSettingsSections(user: SessionUser): Promise<MobileSettingsSection[]> {
  const t = await getTranslations("mobileSettings");
  const db = getDb();
  const paths = getLibraryPaths();
  const stats = db
    .prepare(
      `SELECT platform_slug, COUNT(*) AS count FROM roms WHERE missing = 0 GROUP BY platform_slug ORDER BY count DESC`
    )
    .all() as { platform_slug: string; count: number }[];
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

  return [
    {
      key: "system",
      label: t("sections.system.label"),
      icon: "🖳",
      blurb: t("sections.system.blurb"),
      content: <SettingsSystem />,
    },
    {
      key: "library",
      label: t("sections.library.label"),
      icon: "▤",
      blurb: t("sections.library.blurb"),
      content: (
        <SettingsStorage
          initialPaths={paths}
          initialSystemFolders={getSystemFolders()}
          gameCounts={Object.fromEntries(stats.map((s) => [s.platform_slug, s.count]))}
          initialHidden={[...getHiddenSystems()]}
          systemDisplay={getSystemDisplayMap()}
        />
      ),
    },
    {
      key: "maintenance",
      label: t("sections.maintenance.label"),
      icon: "🔧",
      blurb: t("sections.maintenance.blurb"),
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
      label: t("sections.scraping.label"),
      icon: "🌐",
      blurb: t("sections.scraping.blurb"),
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
      label: t("sections.providers.label"),
      icon: "☁",
      blurb: t("sections.providers.blurb"),
      content: (<><SettingsInternet /><SettingsLaunchBox /><SettingsDatDb /></>),
    },
    { key: "firmware", label: t("sections.firmware.label"), icon: "▶", blurb: t("sections.firmware.blurb"), content: <SettingsInGame /> },
    {
      key: "news",
      label: t("sections.news.label"),
      icon: "📰",
      blurb: t("sections.news.blurb"),
      content: <SettingsNews />,
    },
    {
      key: "automation",
      label: t("sections.automation.label"),
      icon: "⏱",
      blurb: t("sections.automation.blurb"),
      content: <SettingsAutomation />,
    },
    {
      key: "reports",
      label: t("sections.reports.label"),
      icon: "📊",
      blurb: t("sections.reports.blurb"),
      content: <ReportsPanel />,
    },
    {
      key: "activity",
      label: t("sections.activity.label"),
      icon: "📜",
      blurb: t("sections.activity.blurb"),
      content: <ActivityLog mobile />,
    },
    { key: "customization", label: t("sections.customization.label"), icon: "🎨", blurb: t("sections.customization.blurb"), content: <AppearancePanel /> },
    { key: "audio", label: t("sections.audio.label"), icon: "🔊", blurb: t("sections.audio.blurb"), content: <SettingsAudio isAdmin /> },
    { key: "controller", label: t("sections.controller.label"), icon: "🎮", blurb: t("sections.controller.blurb"), content: <SettingsController /> },
    { key: "keyboard", label: t("sections.keyboard.label"), icon: "⌨", blurb: t("sections.keyboard.blurb"), content: <SettingsKeyboard /> },
    { key: "accessibility", label: t("sections.accessibility.label"), icon: "♿", blurb: t("sections.accessibility.blurb"), content: <SettingsAccessibility /> },
    { key: "language", label: t("sections.language.label"), icon: "🌐", blurb: t("sections.language.blurb"), content: <SettingsLanguage /> },
    {
      key: "users",
      label: t("sections.users.label"),
      icon: "👥",
      blurb: t("sections.users.blurb"),
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
      label: t("sections.ageRestrictions.label"),
      icon: "🔞",
      blurb: t("sections.ageRestrictions.blurb"),
      content: (
        <SettingsAgeRestrictions
          initialProfiles={listRestrictionProfiles()}
          systems={presentSystemSlugs()
            .map((slug) => ({ slug, name: platformBySlug(slug)?.name ?? slug }))
            .sort((a, b) => a.name.localeCompare(b.name))}
        />
      ),
    },
  ];
}
