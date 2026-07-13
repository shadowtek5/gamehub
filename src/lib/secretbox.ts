// Symmetric encryption for secrets stored in the SQLite `settings` table
// (metadata-provider credentials, OIDC client secret, …). Values are sealed
// with AES-256-GCM so the database file — and any backup that contains it —
// never holds credentials in plaintext.
//
// The key lives OUTSIDE the database so a leaked DB/backup can't decrypt it:
//   1. GAMEHUB_SECRET_KEY env var (operator-provided; survives restores to a
//      new host when set consistently), else
//   2. a random 32-byte key persisted at data/.secret.key (chmod 600), which
//      is created on first use and is NOT part of GameHub backups.
//
// Sealed values are tagged with a version prefix; anything without it is
// treated as legacy plaintext and passed through unchanged (so existing
// installs keep working and migrate on the next save).

import crypto from "crypto";
import fs from "fs";
import path from "path";

const PREFIX = "gcmv1:";
let cachedKey: Buffer | undefined;

/** Absolute path of the persisted local key (used by backup include/restore). */
export function secretKeyPath(): string {
  return path.join(process.cwd(), "data", ".secret.key");
}

function keyFilePath(): string {
  return secretKeyPath();
}

/** The 32-byte AES key: env master key if set, else a persisted local key. */
function masterKey(): Buffer {
  if (cachedKey) return cachedKey;

  const env = process.env.GAMEHUB_SECRET_KEY?.trim();
  if (env) {
    cachedKey = crypto.createHash("sha256").update(env).digest();
    return cachedKey;
  }

  const file = keyFilePath();
  try {
    const buf = Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64");
    if (buf.length === 32) {
      cachedKey = buf;
      return cachedKey;
    }
  } catch {
    // missing/unreadable — fall through and create one
  }

  const key = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, key.toString("base64"), { mode: 0o600 });
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      // best-effort on platforms without POSIX perms (Windows)
    }
  } catch {
    // can't persist (read-only fs?) — key stays in memory for this process
  }
  cachedKey = key;
  return cachedKey;
}

/** Generate the local key file now if it's missing (and no env master key is
 *  set). Called at setup / first boot so the key exists from the start and is
 *  available to be bundled into backups. No-op when GAMEHUB_SECRET_KEY is set
 *  (that env value IS the key — nothing to persist). */
export function ensureSecretKey(): void {
  if (process.env.GAMEHUB_SECRET_KEY?.trim()) return;
  masterKey();
}

/** Drop the cached key so the next seal/open re-reads it — call after a restore
 *  has swapped data/.secret.key in from a backup. */
export function reloadSecretKey(): void {
  cachedKey = undefined;
}

/** True if a stored value is one we sealed (vs. legacy plaintext). */
export function isSealed(value: string): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Seal a UTF-8 string. Empty strings are returned as-is (nothing to protect
 *  and it keeps "unset" fields readable/diffable). */
export function seal(plaintext: string): string {
  if (!plaintext) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

/** Open a sealed string. Legacy plaintext (no prefix) is returned unchanged.
 *  A value we can't decrypt (wrong/rotated key, corruption) yields "" rather
 *  than throwing, so callers degrade to "unset" instead of crashing. */
export function open(value: string): string {
  if (!value || !isSealed(value)) return value;
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const d = crypto.createDecipheriv("aes-256-gcm", masterKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}
