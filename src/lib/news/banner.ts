// Editorial banners for news cards without a natural image (the GameHub
// changelog + library-milestone totals). The look is a press "release notes"
// card, not app decoration: a restrained dark base, a single brand accent used
// sparingly, a masthead kicker, and an abstract product illustration built from
// the app's own vocabulary (capsule shelves, cover mosaics, growth bars). Real
// console art is always preferred over these — see milestones.ts.
//
// Served by /api/news/banner from a small param set; bannerUrl() builds the URL
// and variantAccent() exposes the accent for the card's eyebrow dot.

export interface BannerParams {
  variant: string;
  color?: string; // hex, with or without leading #
  text?: string; // masthead value (e.g. a system short name)
  number?: string; // milestone total
  kicker?: string; // override the variant's default masthead label
  bare?: boolean; // suppress the big text (a real-art overlay will cover it)
}

const BRAND = "#4c9be8"; // muted Steam blue — the publication's masthead color
const AMBER = "#d9a441"; // milestone/report accent
const COMMUNITY = "#8f6fff"; // external community feeds

const ACCENTS: Record<string, string> = {
  recommendations: BRAND,
  mobile: BRAND,
  hashing: BRAND,
  security: BRAND,
  artwork: BRAND,
  automation: BRAND,
  downloads: BRAND,
  news: BRAND,
  default: BRAND,
  system: BRAND,
  trophy: AMBER,
  romhack: COMMUNITY,
  translation: COMMUNITY,
  emulation: COMMUNITY,
  community: COMMUNITY,
};

const KICKERS: Record<string, string> = {
  recommendations: "RELEASE NOTES",
  mobile: "RELEASE NOTES",
  hashing: "RELEASE NOTES",
  security: "RELEASE NOTES",
  artwork: "RELEASE NOTES",
  automation: "RELEASE NOTES",
  downloads: "RELEASE NOTES",
  news: "BULLETIN",
  default: "GAMEHUB",
  system: "LIBRARY MILESTONE",
  trophy: "LIBRARY MILESTONE",
  romhack: "ROM HACK",
  translation: "TRANSLATION",
  emulation: "EMULATION",
  community: "COMMUNITY",
};

function accentFor(variant: string): string {
  return ACCENTS[variant] ?? BRAND;
}

export function variantAccent(variant: string): string {
  return accentFor(variant);
}

/** Sanitize a hex color from untrusted query params before it enters the SVG. */
function safeColor(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const hex = raw.replace(/^#/, "");
  return /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(hex) ? `#${hex}` : fallback;
}

function esc(s: string, max = 24): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .slice(0, max);
}

export function bannerUrl(
  variant: string,
  opts: { color?: string; text?: string; number?: string; kicker?: string; bare?: boolean } = {}
): string {
  const q = new URLSearchParams({ v: variant });
  if (opts.color) q.set("c", opts.color.replace(/^#/, ""));
  if (opts.text) q.set("t", opts.text);
  if (opts.number) q.set("n", opts.number);
  if (opts.kicker) q.set("k", opts.kicker);
  if (opts.bare) q.set("b", "1");
  return `/api/news/banner?${q.toString()}`;
}

const W = "rgba(255,255,255,"; // white with alpha helper prefix
const LINE = `${W}0.16)`;
const FILL = `${W}0.05)`;
const FONT = `font-family="system-ui,'Segoe UI',Arial,sans-serif"`;

/** rounded rect helper */
function r(x: number, y: number, w: number, h: number, rx: number, fill: string, stroke = "none", sw = 0) {
  const s = stroke === "none" ? "" : ` stroke="${stroke}" stroke-width="${sw}"`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${s}/>`;
}

/** The per-variant product illustration, drawn on the right-hand ~half. */
function illustration(variant: string, accent: string, p: BannerParams): string {
  switch (variant) {
    case "recommendations": {
      // a shelf of capsule tiles, the featured one raised + accented
      const hs = [112, 150, 128, 150, 120];
      const feat = 1;
      let out = `<line x1="286" y1="240" x2="576" y2="240" stroke="${LINE}" stroke-width="1"/>`;
      hs.forEach((h, i) => {
        const x = 296 + i * 58;
        const y = 236 - h;
        out +=
          i === feat
            ? r(x, y - 8, 50, h + 8, 6, accent) + r(x + 8, y + 6, 34, 6, 3, "rgba(0,0,0,0.25)")
            : r(x, y, 50, h, 6, FILL, LINE, 1);
      });
      return out;
    }
    case "mobile": {
      const px = 452,
        py = 40;
      let out = r(px, py, 104, 192, 16, FILL, LINE, 1.5);
      out += r(px + 20, py + 8, 28, 5, 2.5, `${W}0.28)`); // notch
      out += `<rect x="${px + 12}" y="${py + 22}" width="80" height="146" rx="6" fill="${accent}" opacity="0.1"/>`;
      const tiles = [
        [px + 14, py + 26],
        [px + 56, py + 26],
        [px + 14, py + 74],
        [px + 56, py + 74],
        [px + 14, py + 122],
        [px + 56, py + 122],
      ];
      tiles.forEach(
        ([tx, ty], i) => (out += r(tx, ty, 34, 40, 3, i === 0 ? accent : `${W}0.14)`, "none", 0))
      );
      out += r(px + 44, py + 176, 16, 3, 1.5, `${W}0.3)`); // home bar
      return out;
    }
    case "hashing": {
      // three verified-checksum rows: a track, a filled portion, a tick
      const rows = [
        [92, 210],
        [138, 150],
        [184, 188],
      ];
      let out = "";
      rows.forEach(([y, fillW]) => {
        out += r(300, y, 210, 16, 8, FILL, LINE, 1);
        out += `<rect x="300" y="${y}" width="${fillW}" height="16" rx="8" fill="${accent}" opacity="0.55"/>`;
        out += `<path d="M528 ${y + 8} l4 4 8 -9" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
      });
      return out;
    }
    case "security": {
      const bx = 468,
        by = 112;
      let out = `<path d="M${bx + 18} ${by} v-14 a20 20 0 0 1 40 0 v14" fill="none" stroke="${LINE}" stroke-width="5"/>`;
      out += r(bx, by, 76, 64, 12, FILL, LINE, 1.5);
      out += `<circle cx="${bx + 38}" cy="${by + 28}" r="7" fill="${accent}"/>`;
      out += r(bx + 34, by + 32, 8, 16, 3, accent);
      // masked credential field
      out += r(444, 192, 128, 24, 12, FILL, LINE, 1);
      for (let i = 0; i < 7; i++)
        out += `<circle cx="${462 + i * 15}" cy="204" r="3.2" fill="${i === 6 ? accent : `${W}0.5)`}"/>`;
      return out;
    }
    case "artwork": {
      // a cover mosaic, two tiles accented
      let out = "";
      const cols = [312, 376, 440, 504];
      const rows = [64, 150];
      cols.forEach((x, ci) =>
        rows.forEach((y, ri) => {
          const hot = (ci === 1 && ri === 0) || (ci === 3 && ri === 1);
          out += r(x, y, 48, 74, 4, hot ? accent : FILL, hot ? "none" : LINE, 1);
          if (hot) {
            out += `<circle cx="${x + 13}" cy="${y + 20}" r="4" fill="rgba(0,0,0,0.3)"/>`;
            out += `<path d="M${x + 6} ${y + 60} l12 -14 10 10 8 -8 6 6" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="2.5" stroke-linejoin="round"/>`;
          }
        })
      );
      return out;
    }
    case "automation": {
      // a clock (scheduler) beside a stack of "runs on a schedule" bars
      const cx = 356,
        cy = 132;
      let out = `<circle cx="${cx}" cy="${cy}" r="50" fill="${FILL}" stroke="${LINE}" stroke-width="1.5"/>`;
      out += `<path d="M${cx} ${cy} V${cy - 30}" stroke="${accent}" stroke-width="5" stroke-linecap="round"/>`;
      out += `<path d="M${cx} ${cy} l22 13" stroke="${accent}" stroke-width="5" stroke-linecap="round"/>`;
      out += `<circle cx="${cx}" cy="${cy}" r="5" fill="${accent}"/>`;
      const bars = [128, 96, 116];
      bars.forEach((w, i) => {
        const y = 92 + i * 40;
        out += r(452, y, 124, 16, 8, FILL, LINE, 1);
        out += r(452, y, Math.min(124, w), 16, 8, accent);
      });
      return out;
    }
    case "downloads": {
      // a download arrow into a tray, then a queue of rows (first one active)
      const ax = 344;
      let out = `<path d="M${ax} 72 v50 m-20 -18 l20 18 20 -18" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
      out += `<path d="M${ax - 42} 146 v24 a6 6 0 0 0 6 6 h72 a6 6 0 0 0 6 -6 v-24" fill="none" stroke="${LINE}" stroke-width="4"/>`;
      [92, 124, 156].forEach((y, i) => {
        out += r(452, y, 124, 14, 7, i === 0 ? accent : FILL, i === 0 ? "none" : LINE, 1);
      });
      return out;
    }
    case "trophy": {
      // milestone REPORT: big total + ascending growth bars
      const n = p.number ? esc(p.number, 10) : "";
      let out = n
        ? `<text x="44" y="178" ${FONT} font-size="96" font-weight="800" fill="${W}0.95)">${n}</text>`
        : "";
      const hs = [46, 74, 104, 138, 176];
      hs.forEach((h, i) => {
        const x = 372 + i * 44;
        const hot = i >= 3;
        out += r(x, 214 - h, 28, h, 4, hot ? accent : `${W}0.14)`);
      });
      out += `<line x1="360" y1="216" x2="576" y2="216" stroke="${LINE}" stroke-width="1"/>`;
      return out;
    }
    case "system": {
      // A "library shelf" motif of cover tiles across the bottom. When a real
      // system logo will be overlaid (bare), we leave the plate clean; otherwise
      // the console short-name sits on a plaque with an accent keyline.
      let out = "";
      const tiles = [312, 366, 420, 474, 528];
      const th = [96, 118, 104, 120, 100];
      out += `<line x1="298" y1="212" x2="576" y2="212" stroke="${LINE}" stroke-width="1"/>`;
      tiles.forEach((x, i) => (out += r(x, 208 - th[i], 44, th[i], 5, FILL, LINE, 1)));
      if (!p.bare) {
        const t = p.text ? esc(p.text, 8) : "SYSTEM";
        out += r(300, 70, 262, 96, 10, "rgba(11,15,20,0.72)", accent, 1.5);
        out += r(300, 70, 64, 4, 0, accent);
        out += `<text x="431" y="134" ${FONT} font-size="52" font-weight="800" fill="${W}0.92)" text-anchor="middle" letter-spacing="1">${t}</text>`;
      }
      return out;
    }
    case "romhack": {
      // a cartridge with a "patch" diff (+/− rows) beside it
      const cx = 300;
      let out = r(cx, 76, 92, 116, 8, FILL, LINE, 1.5);
      out += r(cx + 14, 76, 64, 14, 0, `${W}0.14)`); // label strip
      out += r(cx + 20, 96, 52, 8, 2, accent); // accent band
      out += r(cx + 12, 176, 68, 8, 3, `${W}0.14)`); // contacts
      // diff rows
      const dx = 424;
      const rows: [number, string][] = [
        [92, accent],
        [120, `${W}0.16)`],
        [148, accent],
        [176, `${W}0.16)`],
      ];
      rows.forEach(([y, c], i) => {
        out += `<text x="${dx}" y="${y + 6}" ${FONT} font-size="26" font-weight="800" fill="${c}">${i % 2 ? "−" : "+"}</text>`;
        out += r(dx + 26, y - 6, 118 - i * 14, 12, 3, c === accent ? `${accent}` : `${W}0.12)`);
      });
      return out;
    }
    case "translation": {
      // source glyph → translated glyph, two script blocks with an arrow
      let out = r(316, 92, 96, 96, 12, FILL, LINE, 1.5);
      out += `<text x="364" y="158" ${FONT} font-size="58" font-weight="800" fill="${W}0.5)" text-anchor="middle">A</text>`;
      out += `<path d="M430 140 h44 m-12 -10 l12 10 -12 10" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
      out += r(492, 92, 96, 96, 12, accent, "none", 0);
      out += `<text x="540" y="160" ${FONT} font-size="56" font-weight="800" fill="rgba(11,15,20,0.85)" text-anchor="middle">文</text>`;
      return out;
    }
    case "emulation": {
      // a CPU chip with pins + a small play glyph
      const bx = 372,
        by = 92;
      let out = r(bx, by, 96, 96, 10, FILL, LINE, 1.5);
      out += r(bx + 26, by + 26, 44, 44, 6, accent, "none", 0);
      for (let i = 0; i < 4; i++) {
        const off = 18 + i * 22;
        out += r(bx + off, by - 10, 6, 12, 2, `${W}0.2)`); // top pins
        out += r(bx + off, by + 94, 6, 12, 2, `${W}0.2)`); // bottom pins
        out += r(bx - 10, by + off, 12, 6, 2, `${W}0.2)`); // left pins
        out += r(bx + 94, by + off, 12, 6, 2, `${W}0.2)`); // right pins
      }
      out += `<path d="M${bx + 40} ${by + 38} v20 l16 -10 z" fill="rgba(11,15,20,0.85)"/>`;
      return out;
    }
    default: {
      // generic bulletin: a thumbnail + article lines
      let out = r(454, 74, 108, 116, 8, FILL, LINE, 1);
      out += r(468, 92, 80, 54, 4, accent);
      [104, 134, 164].forEach((y, i) => (out += r(300, y, [130, 150, 96][i], 11, 3, `${W}0.13)`)));
      return out;
    }
  }
}

/** Render the banner SVG (300×132 display aspect, 2× for crispness). */
export function renderBanner(p: BannerParams): string {
  const accent = safeColor(p.color, accentFor(p.variant));
  const kicker = p.kicker?.trim() ? p.kicker.toUpperCase() : (KICKERS[p.variant] ?? "GAMEHUB");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="264" viewBox="0 0 600 264" fill="none" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#141b24"/>
      <stop offset="1" stop-color="#0b0f14"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.82" cy="0.1" r="0.9">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="600" height="264" fill="url(#bg)"/>
  <rect width="600" height="264" fill="url(#glow)"/>
  <rect width="600" height="3" fill="${accent}"/>
  <rect x="40" y="40" width="9" height="9" fill="${accent}"/>
  <text x="58" y="49" ${FONT} font-size="18" font-weight="700" letter-spacing="3.5" fill="${W}0.6)">${esc(kicker)}</text>
  ${illustration(p.variant, accent, p)}
</svg>`;
}
