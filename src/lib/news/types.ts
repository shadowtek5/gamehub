// Unified "news item" model. Every home-page news source — the GameHub app
// changelog, auto-generated library milestones, admin announcements, and scraped
// external feeds (ROM hacks / translations) — normalizes to this shape so the
// What's New tab can render them with one card component.

export type NewsSource = "app" | "milestone" | "announcement" | "external";

export interface NewsItem {
  /** stable key, unique across a render (source-prefixed) */
  id: string;
  source: NewsSource;
  /** short display label for the eyebrow, e.g. "GameHub", "Library", "ROM Hacks" */
  category: string;
  title: string;
  /** optional summary / body (plain text; HTML is stripped upstream) */
  body?: string | null;
  /** external link — when present the card opens it in a new tab */
  url?: string | null;
  /** internal route — when present the card navigates within the app (same tab) */
  href?: string | null;
  image?: string | null;
  /** real art (e.g. a system logo) composited on top of a generated `image`
   *  background — kept separate because SVG-as-<img> can't embed external art */
  overlay?: string | null;
  /** ISO timestamp used for sorting + the card's date line */
  date: string;
  /** accent color for the eyebrow dot (falls back to the theme accent) */
  accent?: string | null;
}

/** One labeled row of news in the What's New tab. */
export interface NewsSection {
  key: NewsSource;
  title: string;
  items: NewsItem[];
}
