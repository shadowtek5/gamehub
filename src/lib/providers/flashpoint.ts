// Flashpoint Archive (flashpointarchive.org): metadata for 180k+ Flash and
// browser games, via the community DB API. Used automatically for the
// "flash" platform — no configuration needed.

const API = "https://db-api.unstable.life";
const IMG = "https://infinity.unstable.life/images";

export interface FlashpointResult {
  game: {
    description?: string;
    developer?: string;
    publisher?: string;
    genre?: string;
    releaseDate?: string;
  };
  media: Partial<Record<"boxart" | "screenshot", { url: string; format: string }>>;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function flashpointLookup(
  title: string
): Promise<{ result?: FlashpointResult; error?: string }> {
  try {
    const clean = title.replace(/\([^)]*\)/g, "").trim();
    const res = await fetch(
      `${API}/search?smartSearch=${encodeURIComponent(clean)}&filter=true&fields=id,title,developer,publisher,originalDescription,tagsStr,releaseDate&limit=10`,
      { signal: AbortSignal.timeout(20_000) }
    );
    if (!res.ok) return { error: `Flashpoint: HTTP ${res.status}` };
    const games = (await res.json().catch(() => [])) as Record<string, unknown>[];
    if (!Array.isArray(games) || games.length === 0) {
      return { error: "Not found on Flashpoint" };
    }
    const target = norm(clean);
    const game =
      games.find((g) => norm(String(g.title ?? "")) === target) ?? games[0];
    const id = String(game.id ?? "");
    if (!id) return { error: "Flashpoint returned no id" };

    const imgPath = `${id.slice(0, 2)}/${id.slice(2, 4)}/${id}.png`;
    const result: FlashpointResult = {
      game: {
        description:
          typeof game.originalDescription === "string" && game.originalDescription.trim()
            ? game.originalDescription.trim()
            : undefined,
        developer: typeof game.developer === "string" ? game.developer || undefined : undefined,
        publisher: typeof game.publisher === "string" ? game.publisher || undefined : undefined,
        genre:
          typeof game.tagsStr === "string"
            ? game.tagsStr.split(";").map((t) => t.trim()).filter(Boolean).slice(0, 5).join(", ") ||
              undefined
            : undefined,
        releaseDate:
          typeof game.releaseDate === "string" ? game.releaseDate.slice(0, 10) || undefined : undefined,
      },
      media: {
        boxart: { url: `${IMG}/Logos/${imgPath}`, format: "png" },
        screenshot: { url: `${IMG}/Screenshots/${imgPath}`, format: "png" },
      },
    };
    return { result };
  } catch (e) {
    return { error: `Flashpoint: ${e instanceof Error ? e.message : e}` };
  }
}
