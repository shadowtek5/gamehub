// Hasheous (hasheous.org): free, open-source hash-matching service. Given a
// ROM's CRC/MD5/SHA1 it returns the exact game, including its IGDB id — far
// more reliable than filename matching for renamed or obscure dumps.

const API = "https://hasheous.org/api/v1";

const globalCache = globalThis as unknown as {
  __hasheousCache?: Map<string, number | null>;
};
function cache(): Map<string, number | null> {
  if (!globalCache.__hasheousCache) globalCache.__hasheousCache = new Map();
  return globalCache.__hasheousCache;
}

function findIgdbId(obj: unknown): number | null {
  // The response carries a metadata-source array for the game AND for its
  // platform and publisher — each with its own `source: "IGDB"` entry. Only the
  // GAME entry's id is an IGDB *game* id; the platform/company entries hold IGDB
  // platform/company ids (e.g. NES=18, Nintendo=70) that would resolve to a
  // completely unrelated game. So we require objectType === "Game" and a real
  // numeric id (an unmapped source has id ""), and never dig ids out of URLs.
  const seen = new Set<unknown>();
  const stack: unknown[] = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    const rec = cur as Record<string, unknown>;
    const source = rec.source ?? rec.Source ?? rec.provider;
    const objectType = rec.objectType ?? rec.ObjectType ?? rec.type;
    const isGame =
      typeof objectType === "string" ? /game/i.test(objectType) : objectType == null;
    if (typeof source === "string" && /igdb/i.test(source) && isGame) {
      for (const key of ["immutableId", "ImmutableId", "id", "Id", "matchId"]) {
        const n = Number(rec[key]);
        if (Number.isInteger(n) && n > 0) return n;
      }
    }
    for (const v of Object.values(rec)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

/** Look up a ROM by hash; returns its IGDB id when Hasheous knows the dump */
export async function hasheousLookup(hashes: {
  md5?: string | null;
  sha1?: string | null;
  crc32?: string | null;
}): Promise<{ igdbId: number | null; error?: string }> {
  const key = hashes.md5 ?? hashes.sha1 ?? hashes.crc32;
  if (!key) return { igdbId: null };
  const hit = cache().get(key);
  if (hit !== undefined) return { igdbId: hit };

  try {
    const body: Record<string, string> = {};
    // Field casing has varied across Hasheous versions — send all spellings;
    // unknown keys are ignored server-side
    if (hashes.md5) body.mD5 = body.md5 = body.MD5 = hashes.md5;
    if (hashes.sha1) body.sHA1 = body.sha1 = body.SHA1 = hashes.sha1;
    if (hashes.crc32) body.cRC = body.crc = body.CRC = hashes.crc32;

    const res = await fetch(`${API}/Lookup/ByHash?returnAllSources=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) {
      cache().set(key, null);
      return { igdbId: null };
    }
    if (!res.ok) return { igdbId: null, error: `Hasheous: HTTP ${res.status}` };
    const data = await res.json().catch(() => null);
    const igdbId = data ? findIgdbId(data) : null;
    cache().set(key, igdbId);
    return { igdbId };
  } catch (e) {
    return { igdbId: null, error: `Hasheous: ${e instanceof Error ? e.message : e}` };
  }
}
