// Generated badge artwork, drawn in the same "release notes" visual language as
// the What's New banners (see news/banner.ts): a restrained dark base, a single
// accent used sparingly, a masthead kicker, and an abstract vector illustration.
// Everything is drawn as shapes (no emoji glyphs) so the SVG renders identically
// whether it's an <img> src, a CSS background, or inlined — emoji fonts are not
// available when an SVG is loaded as an image.
//
// Served by /api/badges/art; badgeArtUrl() builds the URL.

export interface BadgeArtParams {
  variant: string; // art family: playtime | completion | social | …
  color?: string; // accent hex, with or without leading #
  name?: string; // badge name shown along the bottom
}

const W = "rgba(255,255,255,";
const LINE = `${W}0.16)`;
const FILL = `${W}0.06)`;
const FONT = `font-family="system-ui,'Segoe UI',Arial,sans-serif"`;

function safeColor(raw: string | undefined, fallback = "#4c9be8"): string {
  if (!raw) return fallback;
  const hex = raw.replace(/^#/, "");
  return /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : fallback;
}

function esc(s: string, max = 22): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .slice(0, max);
}

function r(x: number, y: number, w: number, h: number, rx: number, fill: string, stroke = "none", sw = 0) {
  const s = stroke === "none" ? "" : ` stroke="${stroke}" stroke-width="${sw}"`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${s}/>`;
}

/** The per-variant illustration, centered on ~(160,150) within the 320-box. */
function illustration(variant: string, a: string): string {
  switch (variant) {
    case "playtime": {
      // a clock face with hands
      const cx = 160,
        cy = 148;
      let out = `<circle cx="${cx}" cy="${cy}" r="64" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>`;
      out += `<circle cx="${cx}" cy="${cy}" r="64" fill="none" stroke="${a}" stroke-width="3" stroke-dasharray="6 10" opacity="0.5"/>`;
      out += `<path d="M${cx} ${cy} V${cy - 40}" stroke="${a}" stroke-width="6" stroke-linecap="round"/>`;
      out += `<path d="M${cx} ${cy} l30 18" stroke="${a}" stroke-width="6" stroke-linecap="round"/>`;
      out += `<circle cx="${cx}" cy="${cy}" r="7" fill="${a}"/>`;
      return out;
    }
    case "played": {
      // a gamepad silhouette
      const cx = 160,
        cy = 150;
      let out = `<rect x="${cx - 78}" y="${cy - 30}" width="156" height="72" rx="34" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>`;
      // d-pad
      out += r(cx - 54, cy - 4, 30, 10, 2, a);
      out += r(cx - 44, cy - 14, 10, 30, 2, a);
      // buttons
      out += `<circle cx="${cx + 42}" cy="${cy - 6}" r="7" fill="${a}"/>`;
      out += `<circle cx="${cx + 58}" cy="${cy + 8}" r="7" fill="${W}0.35)"/>`;
      out += `<circle cx="${cx + 26}" cy="${cy + 8}" r="7" fill="${W}0.35)"/>`;
      return out;
    }
    case "completion": {
      // a trophy cup
      const cx = 160;
      let out = `<path d="M${cx - 34} 96 h68 v18 a34 34 0 0 1 -68 0 z" fill="${a}"/>`;
      out += `<path d="M${cx - 34} 100 h-16 a16 16 0 0 0 16 16" fill="none" stroke="${LINE}" stroke-width="5"/>`;
      out += `<path d="M${cx + 34} 100 h16 a16 16 0 0 1 -16 16" fill="none" stroke="${LINE}" stroke-width="5"/>`;
      out += r(cx - 8, 148, 16, 22, 2, `${W}0.4)`); // stem
      out += r(cx - 30, 170, 60, 12, 3, FILL, LINE, 2); // base
      out += r(cx - 20, 182, 40, 10, 3, `${W}0.25)`);
      return out;
    }
    case "collection": {
      // a heart over a small tile mosaic
      const cx = 160;
      let out = "";
      const cols = [cx - 66, cx - 22, cx + 22];
      cols.forEach((x, i) => (out += r(x, 168, 34, 30, 4, i === 1 ? a : FILL, i === 1 ? "none" : LINE, 1.5)));
      out += `<path d="M${cx} 150 c-22 -22 -52 -4 -34 22 l34 34 34 -34 c18 -26 -12 -44 -34 -22 z" fill="${a}"/>`;
      return out;
    }
    case "curation": {
      // a five-point star
      const cx = 160,
        cy = 146,
        R = 58,
        rr = 24;
      let pts = "";
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? R : rr;
        pts += `${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)} `;
      }
      return `<polygon points="${pts.trim()}" fill="${a}" stroke="${W}0.2)" stroke-width="1.5"/>`;
    }
    case "saves": {
      // an hourglass
      const cx = 160;
      let out = r(cx - 40, 88, 80, 10, 3, `${W}0.3)`);
      out += r(cx - 40, 200, 80, 10, 3, `${W}0.3)`);
      out += `<path d="M${cx - 32} 98 h64 l-32 50 z" fill="${a}" opacity="0.85"/>`;
      out += `<path d="M${cx - 32} 200 h64 l-32 -50 z" fill="${FILL}" stroke="${LINE}" stroke-width="1.5"/>`;
      out += `<circle cx="${cx}" cy="150" r="4" fill="${a}"/>`;
      return out;
    }
    case "breadth": {
      // a globe with meridians
      const cx = 160,
        cy = 150,
        R = 62;
      let out = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>`;
      out += `<line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="${a}" stroke-width="2.5"/>`;
      out += `<ellipse cx="${cx}" cy="${cy}" rx="26" ry="${R}" fill="none" stroke="${a}" stroke-width="2.5"/>`;
      out += `<ellipse cx="${cx}" cy="${cy}" rx="${R}" ry="30" fill="none" stroke="${W}0.22)" stroke-width="2"/>`;
      out += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${a}" stroke-width="1" opacity="0.5"/>`;
      return out;
    }
    case "social": {
      // two linked person nodes
      const l = 122,
        rr = 198,
        y = 150;
      let out = `<line x1="${l + 12}" y1="${y}" x2="${rr - 12}" y2="${y}" stroke="${a}" stroke-width="4"/>`;
      [l, rr].forEach((x, i) => {
        out += `<circle cx="${x}" cy="${y - 20}" r="16" fill="${i === 0 ? a : FILL}" stroke="${i === 0 ? "none" : LINE}" stroke-width="2"/>`;
        out += `<path d="M${x - 22} ${y + 30} a22 22 0 0 1 44 0 z" fill="${i === 0 ? a : FILL}" stroke="${i === 0 ? "none" : LINE}" stroke-width="2"/>`;
      });
      return out;
    }
    case "loyalty": {
      // a medal on a ribbon
      const cx = 160;
      let out = `<path d="M${cx - 24} 92 l-20 44 20 6 12 -30 z" fill="${a}" opacity="0.8"/>`;
      out += `<path d="M${cx + 24} 92 l20 44 -20 6 -12 -30 z" fill="${W}0.25)"/>`;
      out += `<circle cx="${cx}" cy="162" r="42" fill="${FILL}" stroke="${a}" stroke-width="3"/>`;
      out += `<circle cx="${cx}" cy="162" r="26" fill="none" stroke="${a}" stroke-width="2" stroke-dasharray="4 6"/>`;
      out += `<circle cx="${cx}" cy="162" r="8" fill="${a}"/>`;
      return out;
    }
    case "library": {
      // a shelf of book spines
      const base = 200;
      const specs: [number, number][] = [
        [96, 96],
        [116, 74],
        [136, 108],
        [156, 86],
        [176, 100],
        [196, 80],
      ];
      let out = `<line x1="84" y1="${base + 4}" x2="236" y2="${base + 4}" stroke="${LINE}" stroke-width="2"/>`;
      specs.forEach(([x, h], i) => (out += r(x, base - h, 16, h, 2, i % 2 ? a : FILL, i % 2 ? "none" : LINE, 1.5)));
      return out;
    }
    default: {
      // a shield crest
      const cx = 160;
      let out = `<path d="M${cx} 92 l52 18 v40 c0 34 -26 54 -52 66 c-26 -12 -52 -32 -52 -66 v-40 z" fill="${FILL}" stroke="${a}" stroke-width="3"/>`;
      out += `<path d="M${cx - 20} 152 l14 14 26 -30" fill="none" stroke="${a}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
      return out;
    }
  }
}

/** Render a square badge card SVG (320×320). */
export function renderBadgeArt(p: BadgeArtParams): string {
  const accent = safeColor(p.color);
  const name = p.name ? esc(p.name, 22) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320" fill="none" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#141b24"/>
      <stop offset="1" stop-color="#0b0f14"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.36" r="0.75">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="320" height="320" rx="10" fill="url(#bg)"/>
  <rect width="320" height="320" rx="10" fill="url(#glow)"/>
  <rect width="320" height="3" fill="${accent}"/>
  <rect x="24" y="24" width="8" height="8" fill="${accent}"/>
  <text x="40" y="32" ${FONT} font-size="13" font-weight="700" letter-spacing="3" fill="${W}0.55)">ACHIEVEMENT</text>
  ${illustration(p.variant, accent)}
  ${name ? `<text x="160" y="272" ${FONT} font-size="24" font-weight="800" fill="${W}0.94)" text-anchor="middle">${name}</text>` : ""}
</svg>`;
}

/** URL for a badge's generated art. */
export function badgeArtUrl(variant: string, opts: { color?: string; name?: string } = {}): string {
  const q = new URLSearchParams({ v: variant });
  if (opts.color) q.set("c", opts.color.replace(/^#/, ""));
  if (opts.name) q.set("n", opts.name);
  return `/api/badges/art?${q.toString()}`;
}
