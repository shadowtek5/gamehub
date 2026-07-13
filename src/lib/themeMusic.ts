// Per-game title theme music. An uploaded audio file (roms.theme_url) always
// wins; otherwise the first YouTube result for "{title} {system} title theme"
// is cached on the rom (theme_yt_id) and played through a hidden embed.

/** Pull an 11-char video id out of any YouTube URL form (or a bare id). */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(
    /(?:youtube\.com\/(?:watch\?[^#]*\bv=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m?.[1] ?? null;
}

/**
 * First video id on YouTube's results page for a query (no API key needed —
 * same trick every scraper frontend uses). Returns null when nothing matched
 * or YouTube is unreachable.
 */
export async function ytSearchVideoId(query: string): Promise<string | null> {
  try {
    // sp=EgIQAQ%3D%3D filters results to videos only (no channels/playlists)
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) return null;
    const html = await res.text();
    return html.match(/"videoId":"([A-Za-z0-9_-]{11})"/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function themeSearchQuery(title: string, platformName: string): string {
  return `${title} ${platformName} title theme music`;
}
