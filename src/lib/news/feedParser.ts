// Minimal, dependency-free RSS 2.0 + Atom parser. Feeds in the wild are messy,
// so this is deliberately tolerant: it pulls <item>/<entry> blocks with regex,
// unwraps CDATA, decodes the common entities, strips HTML from summaries, and
// digs an image out of enclosure / media:* / the first <img> in the content.
// Good enough for the reddit/GBAtemp-style feeds we surface; not a validator.

export interface ParsedEntry {
  title: string;
  link: string | null;
  date: string | null; // ISO
  summary: string | null;
  image: string | null;
}

const NAMED: Record<string, string> = {
  lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", amp: "&",
  hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", trade: "™", copy: "©", reg: "®", deg: "°",
};

function codePoint(n: number): string {
  try {
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}

function decode(s: string): string {
  let out = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // numeric + hex character references (reddit uses &#32; for spaces, etc.)
  out = out
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)));
  // named entities (&amp; resolves last so it can't re-open another entity)
  out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : m
  );
  return out.trim();
}

function stripHtml(s: string): string {
  return decode(
    s
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ");
}

/** First capture group of the first matching tag, decoded. */
function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? decode(m[1]) : null;
}

/** An attribute value off the first matching self-or-open tag. */
function attr(block: string, tagName: string, attrName: string): string | null {
  const m = block.match(new RegExp(`<${tagName}\\b[^>]*\\b${attrName}=["']([^"']+)["']`, "i"));
  return m ? decode(m[1]) : null;
}

function toIso(raw: string | null): string | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function findImage(block: string): string | null {
  // media:content / media:thumbnail / enclosure url=...
  for (const t of ["media:content", "media:thumbnail", "enclosure"]) {
    const url = attr(block, t, "url");
    if (url && /\.(png|jpe?g|gif|webp)/i.test(url)) return url;
    if (url && t !== "enclosure") return url;
  }
  // first <img src> in any HTML-bearing field — try each in turn (WordPress
  // often puts the featured image in <description> or <content:encoded>, and a
  // source can exist yet contain no image, so we must not stop at the first).
  for (const t of ["content:encoded", "description", "summary", "content"]) {
    const html = tag(block, t);
    if (!html) continue;
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) return decode(m[1]);
  }
  return null;
}

export function parseFeed(xml: string): ParsedEntry[] {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blockRe = isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi;
  const out: ParsedEntry[] = [];
  for (const m of xml.matchAll(blockRe)) {
    const block = m[0];
    const title = tag(block, "title");
    if (!title) continue;
    // Atom: <link href="…"/> (prefer rel="alternate"); RSS: <link>…</link>
    let link: string | null = null;
    if (isAtom) {
      const alt = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
      link = alt ? decode(alt[1]) : attr(block, "link", "href");
    } else {
      link = tag(block, "link");
    }
    const rawSummary =
      tag(block, "description") ?? tag(block, "summary") ?? tag(block, "content") ?? tag(block, "content:encoded");
    let summary = rawSummary ? stripHtml(rawSummary) : null;
    // drop reddit's "submitted by /u/… to /r/… [link] [comments]" footer
    if (summary) summary = summary.replace(/\s*submitted by\s+\/u\/\S+[\s\S]*$/i, "").trim();
    summary = summary ? summary.slice(0, 280) || null : null;
    const date = toIso(
      tag(block, "pubDate") ?? tag(block, "published") ?? tag(block, "updated") ?? tag(block, "dc:date")
    );
    out.push({ title, link, date, summary, image: findImage(block) });
  }
  return out;
}
