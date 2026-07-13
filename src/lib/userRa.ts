// Per-user RetroAchievements account link.
//
// Each GameHub user links their own RA account by pasting their RetroAchievements
// *Web API key* (retroachievements.org → Settings → Keys). We validate it once,
// then keep the username + sealed key in the per-user user_settings KV store.
// Their achievement lists and unlock progress are pulled with these credentials
// on the game and profile pages — there is no longer any admin-global RA
// provider. The key is read-only and never leaves the server.

import { getUserSettings, setUserSetting, deleteUserSettings } from "./db";
import { seal, open } from "./secretbox";

const K_USER = "ra_username";
const K_KEY = "ra_apikey"; // sealed
const K_LEGACY_TOKEN = "ra_token"; // sealed connect token from the old link flow

const API = "https://retroachievements.org/API";

export interface RaLink {
  linked: boolean;
  username?: string;
}

/** Credentials for the RA Web API — same shape the provider helpers expect. */
export interface RaCreds {
  username: string;
  apiKey: string;
}

/** Validate an RA username + Web API key by hitting a trivial authenticated
 *  endpoint. Returns the canonical username on success; throws with a
 *  user-facing message otherwise. */
export async function raVerifyKey(
  username: string,
  apiKey: string
): Promise<{ username: string; apiKey: string }> {
  let res: Response;
  try {
    res = await fetch(
      `${API}/API_GetUserProfile.php?z=${encodeURIComponent(username)}&y=${encodeURIComponent(apiKey)}&u=${encodeURIComponent(username)}`,
      { signal: AbortSignal.timeout(20_000) }
    );
  } catch (e) {
    throw new Error(`Could not reach RetroAchievements: ${String(e)}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("Invalid RetroAchievements username or Web API key");
  }
  if (!res.ok) throw new Error(`RetroAchievements: HTTP ${res.status}`);
  const data = (await res.json().catch(() => null)) as { User?: string } | null;
  if (!data || !data.User) {
    throw new Error("Invalid RetroAchievements username or Web API key");
  }
  return { username: data.User, apiKey };
}

/** The user's link status (never exposes the key). */
export function getRaLink(userId: number): RaLink {
  const s = getUserSettings(userId);
  const key = s[K_KEY] ? open(s[K_KEY]) : "";
  return {
    linked: !!(s[K_USER] && key),
    username: s[K_USER] || undefined,
  };
}

/** Server-only: the credentials used to pull achievement data for this user. */
export function getRaCreds(userId: number): RaCreds | null {
  const s = getUserSettings(userId);
  const username = s[K_USER] || "";
  const apiKey = s[K_KEY] ? open(s[K_KEY]) : "";
  if (!username || !apiKey) return null;
  return { username, apiKey };
}

export function saveRaLink(userId: number, username: string, apiKey: string) {
  setUserSetting(userId, K_USER, username);
  setUserSetting(userId, K_KEY, seal(apiKey));
  // Drop any stale connect token from the previous (password-based) link flow.
  deleteUserSettings(userId, [K_LEGACY_TOKEN]);
}

export function clearRaLink(userId: number) {
  deleteUserSettings(userId, [K_USER, K_KEY, K_LEGACY_TOKEN]);
}
