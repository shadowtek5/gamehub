// Opt-in TLS override for ScreenScraper. ScreenScraper occasionally serves an
// expired / misconfigured certificate on api.screenscraper.fr (the wildcard is
// renewed on the website host but not rolled onto the API host), which Node's
// fetch correctly rejects with CERT_HAS_EXPIRED. When the admin enables the
// override (Settings › Metadata Sources › ScreenScraper), requests to
// *.screenscraper.fr are made with certificate verification relaxed — and ONLY
// those. Every other host, and the default (override off), uses normal fetch
// with full verification.

import https from "https";
import http from "http";
import { getSetting } from "../db";

const SS_HOST_RE = /(^|\.)screenscraper\.fr$/i;

export function ssInsecureEnabled(): boolean {
  return getSetting("ss_insecure_tls") === "on";
}

// A single agent that skips cert verification; reused across insecure requests.
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function nodeInsecureFetch(url: string, init: RequestInit = {}, redirectsLeft = 3): Promise<Response> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "http:" ? http : https;
    const headers: Record<string, string> = {};
    if (init.headers) new Headers(init.headers as HeadersInit).forEach((v, k) => (headers[k] = v));

    const req = lib.request(
      u,
      { method: init.method ?? "GET", headers, agent: u.protocol === "https:" ? insecureAgent : undefined },
      (res) => {
        const status = res.statusCode ?? 0;
        const loc = res.headers.location;
        if (status >= 300 && status < 400 && loc && redirectsLeft > 0) {
          res.resume(); // drain
          resolve(nodeInsecureFetch(new URL(loc, u).toString(), init, redirectsLeft - 1));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          const out = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            // drop transfer/encoding headers — the body we hand to Response is
            // already fully-read, decompressed bytes
            if (k === "content-encoding" || k === "content-length" || k === "transfer-encoding") continue;
            if (Array.isArray(v)) v.forEach((x) => out.append(k, x));
            else if (v != null) out.set(k, String(v));
          }
          resolve(new Response(Buffer.concat(chunks), { status: status || 200, statusText: res.statusMessage ?? "", headers: out }));
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);

    const signal = init.signal;
    if (signal) {
      if (signal.aborted) req.destroy(new DOMException("The operation was aborted", "AbortError"));
      else signal.addEventListener("abort", () => req.destroy(new DOMException("The operation was aborted", "AbortError")), { once: true });
    }
    if (init.body && typeof init.body === "string") req.write(init.body);
    req.end();
  });
}

/**
 * fetch() for ScreenScraper endpoints. Behaves exactly like global fetch unless
 * the TLS override is on AND the target host is *.screenscraper.fr, in which case
 * the request is made with certificate verification disabled. Returns a standard
 * Response either way so callers are unchanged.
 */
export function ssFetch(url: string, init?: RequestInit): Promise<Response> {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    /* fall through to normal fetch on a bad URL */
  }
  if (ssInsecureEnabled() && SS_HOST_RE.test(host)) {
    return nodeInsecureFetch(url, init);
  }
  return fetch(url, init);
}
