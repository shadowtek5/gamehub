// Builds the home page's "Recommended" shelves from a user's library. Pure and
// in-memory — it works off the HomeLibraryRow[] the home page already loads, so
// no extra queries. Each shelf has a title, a one-line rationale, and up to
// SHELF_MAX games; empty shelves are dropped by the caller.

import { HomeLibraryRow } from "./db";
import { platformBySlug } from "./platforms";

export interface RecommendedShelf {
  key: string;
  title: string;
  subtitle: string;
  roms: HomeLibraryRow[];
}

const SHELF_MAX = 16;
const JUMP_BACK_MIN_DAYS = 7; // played but untouched at least this long

const isPlayed = (r: HomeLibraryRow) => r.playtime_seconds > 0;
const hasArt = (r: HomeLibraryRow) => !!r.boxart_url;

/** Parse scraped ratings ("88/100", "16/20", "4.5/5") to a 0..1 ratio. */
function ratingRatio(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const den = parseFloat(m[2]);
  if (!den || Number.isNaN(num)) return null;
  return num / den;
}

function splitGenres(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,/;|]/)
    .map((g) => g.trim())
    .filter(Boolean);
}

const daysSince = (iso: string | null): number =>
  iso ? (Date.now() - new Date(iso).getTime()) / 86400e3 : Infinity;

export function buildRecommendedShelves(all: HomeLibraryRow[]): RecommendedShelf[] {
  const shelves: RecommendedShelf[] = [];
  const unplayed = all.filter((r) => !isPlayed(r) && hasArt(r));

  // 1) Play Next — unplayed favorites / backlog, newest first.
  const playNext = [...unplayed]
    .sort(
      (a, b) =>
        (b.favorite ?? 0) - (a.favorite ?? 0) ||
        (b.play_status === "backlog" ? 1 : 0) - (a.play_status === "backlog" ? 1 : 0) ||
        (b.added_at ?? "").localeCompare(a.added_at ?? "")
    )
    .slice(0, SHELF_MAX);
  if (playNext.length) {
    shelves.push({
      key: "play-next",
      title: "Play Next",
      subtitle: "Unplayed favorites and backlog picks from your library.",
      roms: playNext,
    });
  }

  // 2) Jump Back In — started but set aside a while ago, most-recent of those first.
  const jumpBack = all
    .filter((r) => isPlayed(r) && hasArt(r) && daysSince(r.last_played_at) >= JUMP_BACK_MIN_DAYS)
    .sort((a, b) => (b.last_played_at ?? "").localeCompare(a.last_played_at ?? ""))
    .slice(0, SHELF_MAX);
  if (jumpBack.length >= 3) {
    shelves.push({
      key: "jump-back",
      title: "Jump Back In",
      subtitle: "Games you started but haven't played in a while.",
      roms: jumpBack,
    });
  }

  // 3) More from your favorite genre — top genre by playtime among played games.
  const genreTime = new Map<string, number>();
  for (const r of all) {
    if (!isPlayed(r)) continue;
    for (const g of splitGenres(r.genre)) genreTime.set(g, (genreTime.get(g) ?? 0) + r.playtime_seconds);
  }
  const topGenre = [...genreTime.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (topGenre) {
    const genrePicks = unplayed
      .filter((r) => splitGenres(r.genre).includes(topGenre))
      .sort((a, b) => (b.added_at ?? "").localeCompare(a.added_at ?? ""))
      .slice(0, SHELF_MAX);
    if (genrePicks.length >= 3) {
      shelves.push({
        key: "genre",
        title: `More ${topGenre}`,
        subtitle: `Because you spend a lot of time with ${topGenre} games.`,
        roms: genrePicks,
      });
    }
  }

  // 4) Hidden gems — highest scraped-rating games you haven't played.
  const gems = unplayed
    .map((r) => ({ r, score: ratingRatio(r.rating) }))
    .filter((x): x is { r: HomeLibraryRow; score: number } => x.score !== null && x.score >= 0.8)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r)
    .slice(0, SHELF_MAX);
  if (gems.length >= 3) {
    shelves.push({
      key: "gems",
      title: "Hidden Gems",
      subtitle: "Highly rated games in your library you haven't tried yet.",
      roms: gems,
    });
  }

  // 5) Dive into a system — the system with the most unplayed games, excluding
  // any already spotlighted by the genre shelf's platform mix.
  const bySystem = new Map<string, HomeLibraryRow[]>();
  for (const r of unplayed) {
    const list = bySystem.get(r.platform_slug) ?? [];
    list.push(r);
    bySystem.set(r.platform_slug, list);
  }
  const topSystem = [...bySystem.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (topSystem && topSystem[1].length >= 6) {
    const name = platformBySlug(topSystem[0])?.name ?? topSystem[0];
    shelves.push({
      key: "system",
      title: `Dive into ${name}`,
      subtitle: `You have ${topSystem[1].length} unplayed ${name} games.`,
      roms: [...topSystem[1]]
        .sort((a, b) => (b.favorite ?? 0) - (a.favorite ?? 0) || (b.added_at ?? "").localeCompare(a.added_at ?? ""))
        .slice(0, SHELF_MAX),
    });
  }

  return shelves;
}
