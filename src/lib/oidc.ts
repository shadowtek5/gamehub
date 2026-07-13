// OpenID Connect single sign-on: authorization-code flow with PKCE against
// any standard IdP (Authentik, Keycloak, Authelia, Google, …). Identity is
// taken from the userinfo endpoint over TLS, so no JWT library is needed.

import crypto from "crypto";
import { getSetting, setSetting, getDb, UserRow } from "./db";
import { seal, open, isSealed } from "./secretbox";

export interface OidcConfig {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string;
  label: string;
  /** Create a GameHub account on first SSO login (else only linked users) */
  autoCreate: boolean;
}

const DEFAULTS: OidcConfig = {
  enabled: false,
  issuer: "",
  clientId: "",
  clientSecret: "",
  label: "Single Sign-On",
  autoCreate: true,
};

export function getOidcConfig(): OidcConfig {
  const raw = getSetting("oidc_config");
  if (!raw) return { ...DEFAULTS };
  // Sealed at rest (holds the client secret). Legacy plaintext is read and
  // re-sealed on the spot.
  const json = open(raw);
  if (json && !isSealed(raw)) {
    try {
      setSetting("oidc_config", seal(json));
    } catch {
      // best-effort
    }
  }
  if (!json) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(json) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setOidcConfig(config: OidcConfig) {
  setSetting("oidc_config", seal(JSON.stringify(config)));
}

export function oidcEnabled(c = getOidcConfig()): boolean {
  return c.enabled && !!c.issuer && !!c.clientId && !!c.clientSecret;
}

// ---------- discovery (cached per process) ----------

export interface OidcEndpoints {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

const globalOidc = globalThis as unknown as {
  __oidcDisco?: { issuer: string; endpoints: OidcEndpoints; at: number };
};

export async function discover(issuer: string): Promise<OidcEndpoints> {
  const cached = globalOidc.__oidcDisco;
  if (cached && cached.issuer === issuer && Date.now() - cached.at < 3600_000) {
    return cached.endpoints;
  }
  const url = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OIDC discovery failed (HTTP ${res.status}) at ${url}`);
  const doc = await res.json();
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.userinfo_endpoint) {
    throw new Error("OIDC discovery document is missing required endpoints");
  }
  const endpoints: OidcEndpoints = {
    authorization_endpoint: doc.authorization_endpoint,
    token_endpoint: doc.token_endpoint,
    userinfo_endpoint: doc.userinfo_endpoint,
  };
  globalOidc.__oidcDisco = { issuer, endpoints, at: Date.now() };
  return endpoints;
}

// ---------- PKCE ----------

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// ---------- user resolution ----------

export interface OidcIdentity {
  sub: string;
  username: string;
  email?: string;
}

function uniqueUsername(base: string): string {
  const db = getDb();
  const clean = base.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 28) || "user";
  let candidate = clean;
  let n = 1;
  while (db.prepare("SELECT id FROM users WHERE username = ?").get(candidate)) {
    candidate = `${clean}${++n}`;
  }
  return candidate;
}

/** Find the account linked to this OIDC subject, or auto-create one. Returns
 *  null when nothing is allowed.
 *
 *  SECURITY: linking is by the IdP `sub` ONLY. We deliberately do NOT link an
 *  incoming identity to an existing local account by matching username or email
 *  — those claims (preferred_username / name / email) are attacker-controllable
 *  on many IdPs, so matching on them would let anyone with an IdP account claim
 *  an existing GameHub account (e.g. the local admin) on first SSO login.
 *  Attaching SSO to a pre-existing account must be an explicit action taken
 *  while already signed in to that account. */
export function resolveOidcUser(
  identity: OidcIdentity,
  autoCreate: boolean
): { id: number; username: string; isAdmin: boolean } | null {
  const db = getDb();

  const linked = db
    .prepare("SELECT * FROM users WHERE oidc_sub = ?")
    .get(identity.sub) as UserRow | undefined;
  if (linked) {
    return { id: linked.id, username: linked.username, isAdmin: linked.is_admin === 1 };
  }

  if (!autoCreate) return null;
  const count = (db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c;
  const seed = identity.username || identity.email?.split("@")[0] || identity.sub;
  const username = uniqueUsername(seed);
  // SSO accounts get an unusable random password — they sign in via the IdP
  const randomHash = `oidc:${crypto.randomBytes(32).toString("hex")}`;
  const info = db
    .prepare(
      "INSERT INTO users (username, password_hash, is_admin, role, oidc_sub) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      username,
      randomHash,
      count === 0 ? 1 : 0,
      count === 0 ? "admin" : "viewer",
      identity.sub
    );
  return { id: Number(info.lastInsertRowid), username, isAdmin: count === 0 };
}
