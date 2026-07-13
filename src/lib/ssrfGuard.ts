// SSRF guard for server-side fetches of user/admin-supplied URLs (art "download
// from URL", etc.). Rejects non-http(s) schemes and any host that resolves to a
// loopback, private, link-local, or otherwise reserved address, and re-checks
// every redirect hop. This blocks the common attacks — pointing an image URL at
// 169.254.169.254 (cloud metadata), localhost, or an internal 10./172./192.168.
// service, directly or via a public→internal redirect.
//
// Residual: a determined DNS-rebinding attacker could still race the resolution
// between our check and fetch's own lookup; fully closing that needs IP pinning
// at the socket level. The range checks here stop all the straightforward cases.

import dns from "dns/promises";
import { isIP } from "net";

function ipv4Blocked(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function ipBlocked(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4Blocked(ip);
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback, unspecified
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
    if (mapped) return ipv4Blocked(mapped[1]);
    const first = parseInt(lower.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    return false;
  }
  return true; // not a valid IP → unsafe
}

/** Throws if the URL is not http(s) or resolves to a private/reserved address. */
export async function assertPublicHttpUrl(raw: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  const host = u.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  let addrs: string[];
  if (isIP(host)) {
    addrs = [host];
  } else {
    try {
      addrs = (await dns.lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new Error("Host did not resolve");
    }
  }
  if (addrs.length === 0) throw new Error("Host did not resolve");
  for (const a of addrs) {
    if (ipBlocked(a)) throw new Error("URL resolves to a private or reserved address");
  }
}

/** fetch() that validates the destination (and every redirect hop) is a public
 *  http(s) address before connecting. Use for any fetch of a user-supplied URL. */
export async function safeFetch(
  raw: string,
  init: RequestInit = {},
  maxRedirects = 4
): Promise<Response> {
  let url = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHttpUrl(url);
    const res = await fetch(url, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      url = new URL(loc, url).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}
