// Embedded ScreenScraper app (developer) credentials.
//
// ScreenScraper requires every scraper app to identify itself with dev
// credentials; like Skraper and other scrapers, GameHub ships them built in
// so end users only ever enter their own account. The credentials live in
// ssdev.generated.ts as an AES-256-GCM blob (written by
// scripts/embed-ss-dev.mjs) and are decrypted lazily, in memory only. They
// are never written to the database, returned by an API, or logged.

import crypto from "crypto";
import { SSDEV_BLOB } from "./ssdev.generated";

export interface SsDevCreds {
  devid: string;
  devpassword: string;
}

let cached: SsDevCreds | null | undefined;

function blobKey(): Buffer {
  return crypto.scryptSync(["gh", "ssdev", "v1"].join("."), "gamehub.ssdev.salt", 32);
}

export function getEmbeddedSsDev(): SsDevCreds | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (SSDEV_BLOB) {
    try {
      const raw = Buffer.from(SSDEV_BLOB, "base64");
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const ciphertext = raw.subarray(28);
      const decipher = crypto.createDecipheriv("aes-256-gcm", blobKey(), iv);
      decipher.setAuthTag(tag);
      const json = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      const parsed = JSON.parse(json);
      if (parsed?.devid && parsed?.devpassword) {
        cached = { devid: String(parsed.devid), devpassword: String(parsed.devpassword) };
      }
    } catch {
      cached = null;
    }
  }
  return cached;
}
