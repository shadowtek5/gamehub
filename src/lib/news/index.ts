// Home-page news aggregator. Pulls the four sources — GameHub app changelog,
// auto library milestones, admin announcements and cached external feeds — and
// returns them as labeled sections for the What's New tab.

import { listAnnouncements } from "../db";
import { NewsItem, NewsSection } from "./types";
import { getAppNews } from "./appNews";
import { getMilestones } from "./milestones";
import { getExternalNews } from "./external";

export type { NewsItem, NewsSection } from "./types";

function announcementItems(limit = 6): NewsItem[] {
  return listAnnouncements(true)
    .slice(0, limit)
    .map((a) => ({
      id: `ann:${a.id}`,
      source: "announcement" as const,
      category: "Announcement",
      title: a.title,
      body: a.body || null,
      date: a.created_at.length <= 10 ? `${a.created_at}T12:00:00.000Z` : a.created_at.replace(" ", "T") + "Z",
      accent: "#f0a020",
    }));
}

/** All news, grouped into the sections the What's New tab renders (in order).
 *  Empty sections are dropped. External fetching is cached + non-blocking. */
export function getHomeNews(): NewsSection[] {
  const sections: NewsSection[] = [
    { key: "announcement", title: "Announcements", items: announcementItems() },
    { key: "app", title: "What's new in GameHub", items: getAppNews() },
    { key: "milestone", title: "Library milestones", items: getMilestones() },
    { key: "external", title: "ROM hacking & translations", items: getExternalNews() },
  ];
  return sections.filter((s) => s.items.length > 0);
}
