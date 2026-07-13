// Generate wireframe SVGs from the detailed controller diagrams in
// public/controllers/{xbox,playstation,nintendo}.svg (VSCView overlays from
// AL2009man/Gamepad-Asset-Pack, MIT — see NOTICE.md). Output: {name}.wire.svg.
//
// 1. Wireframe per drawing convention (MODE):
//    • "stroke" (Xbox, Switch Pro): shapes are SOLID fills → drop fill, stroke
//      the outline (width normalised per file to the same on-screen weight).
//    • "fill" (DualShock 4): outlines are thin FILLED ribbons → recolour the
//      fill, no stroke (stroking a ribbon traces both edges → doubled lines).
//    Colours use `currentColor` so the editor can recolour + HIGHLIGHT elements.
// 2. Drop layers that shouldn't show (Color/Blend fills, shoulder/seam slivers,
//    Dots/Speaker textures, the solid PS-button fill).
// 3. Tag each input element with data-in="<id>" (from INPUT_MAP) so the editor
//    can light up the pressed button on the diagram.
//
// Run: node scripts/wireify-controllers.mjs

import fs from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "public", "controllers");
const DROP_LABEL = /shoulder\s*(top|middle|bottom)|seam|color|blend|dots|speaker|ps icon/i;

const MODE = { xbox: "stroke", nintendo: "stroke", playstation: "fill" };

// Per-file Inkscape-label → highlight input id. Face buttons are keyed by
// PHYSICAL position (south/east/west/north) so highlight follows the pressed
// button regardless of its printed letter/symbol.
const INPUT_MAP = {
  xbox: {
    "A Button": "south", "B Button": "east", "X Button": "west", "Y Button": "north",
    "Xbox One Bumpers": "bumpers", "Left Trigger": "lt", "Right Triggers": "rt",
    "D-PAD": "dpad", "View Button": "select", "Menu Button": "start",
    "Xbox Guide Button": "guide", "Left Stick": "lstick", "Right Stick": "rstick",
  },
  playstation: {
    "Cross": "south", "Circle": "east", "Square": "west", "Triangle": "north",
    "L1": "lb", "R1": "rb", "Left Trigger": "lt", "Right Trigger": "rt",
    "D-PAD Up": "dpad-up", "D-PAD Down": "dpad-down", "D-PAD Left": "dpad-left", "D-PAD Right": "dpad-right",
    "Share Button": "select", "Option Button": "start", "PS Button": "guide",
    "Left Stick": "lstick", "Right Stick": "rstick",
  },
  nintendo: {
    "B Button": "south", "A Button": "east", "Y Button": "west", "X Button": "north",
    "L Bumper": "lb", "R Bumper": "rb", "ZL Trigger": "lt", "ZR Trigger": "rt",
    "D-PAD": "dpad", "Minus": "select", "Plus": "start", "Home": "guide",
    "Left Joystick": "lstick", "Right Joystick": "rstick",
  },
};

// Stroke-mode line weight: normalise per viewBox scale so all render equal.
const BOX_W = 380, BOX_H = 240, TARGET_PX = 0.7;
function viewBox(svg) {
  const m = svg.match(/viewBox="[\d.eE+-]+\s+[\d.eE+-]+\s+([\d.eE+-]+)\s+([\d.eE+-]+)"/);
  return m ? { w: parseFloat(m[1]), h: parseFloat(m[2]) } : { w: 1000, h: 1000 };
}
function strokeUnits(svg) {
  const { w, h } = viewBox(svg);
  return +(TARGET_PX / Math.min(BOX_W / w, BOX_H / h)).toFixed(2);
}

const SHAPE = /<(?:path|ellipse|circle|rect|polygon|polyline|line)\b[\s\S]*?\/>/g;
const OPENTAG = /<(?:g|path|ellipse|circle|rect|polygon|polyline|line)\b[^>]*?>/g;

for (const name of Object.keys(MODE)) {
  const src = path.join(DIR, `${name}.svg`);
  if (!fs.existsSync(src)) { console.warn(`skip ${name}: missing`); continue; }
  const raw = fs.readFileSync(src, "utf8");
  const map = INPUT_MAP[name];

  const style =
    MODE[name] === "fill"
      ? `<style>path,circle,rect,ellipse,polygon,line,polyline,text,tspan{fill:currentColor !important;stroke:none !important;}</style>`
      : `<style>path,circle,rect,ellipse,polygon,line,polyline{fill:none !important;` +
        `stroke:currentColor !important;stroke-width:${strokeUnits(raw)} !important;` +
        `stroke-linejoin:round;stroke-linecap:round;}text,tspan{fill:currentColor !important;stroke:none !important;}</style>`;

  let dropped = 0, tagged = 0;
  let svg = raw.replace(SHAPE, (el) => {
    const label = (el.match(/inkscape:label="([^"]*)"/) || [])[1] || "";
    if (DROP_LABEL.test(label)) { dropped++; return ""; }
    return el;
  });
  // Tag input elements (groups or shapes) with data-in for highlighting.
  svg = svg.replace(OPENTAG, (full) => {
    const label = (full.match(/inkscape:label="([^"]*)"/) || [])[1];
    const id = label != null ? map[label] : undefined;
    if (!id) return full;
    tagged++;
    return full.endsWith("/>")
      ? `${full.slice(0, -2)} data-in="${id}"/>`
      : `${full.slice(0, -1)} data-in="${id}">`;
  });

  fs.writeFileSync(path.join(DIR, `${name}.wire.svg`), svg.replace("</svg>", `${style}</svg>`));
  console.log(`wrote ${name}.wire.svg (mode ${MODE[name]}, dropped ${dropped}, tagged ${tagged})`);
}
