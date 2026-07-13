/**
 * A mosaic of cover art cut into big diagonal slices — a grid of art panels
 * rotated as a whole so every gridline becomes a clean diagonal, with a large
 * focal panel spanning both rows and thin bright seams between slices. Flat (no
 * perspective), vibrant, tightly tiled — the Steam "featured library" collage
 * look. Pure background art (no chrome) so it backs both the full system hero
 * and the compact browse card. Renders nothing when there's no art.
 */

export type CollageLayout = {
  /** grid-template-columns value, e.g. "1.1fr 0.8fr 1.3fr 0.9fr 1fr" */
  cols: string;
  /** grid-template-rows value, e.g. "1fr 1fr" */
  rows: string;
  /** explicit placement per slice; one entry per cover slot */
  cells: { col: number | string; row: number | string; feature?: boolean }[];
};

/**
 * Compact 6-panel layout for the small browse card: one wide band top, two rows
 * of two, one wide band bottom.
 */
export const CARD_LAYOUT: CollageLayout = {
  cols: "1fr 1fr",
  rows: "1.3fr 1fr 1fr 1.3fr",
  cells: [
    { col: "1 / span 2", row: 1, feature: true },
    { col: 1, row: 2 },
    { col: 2, row: 2 },
    { col: 1, row: 3 },
    { col: 2, row: 3 },
    { col: "1 / span 2", row: 4, feature: true },
  ],
};

/**
 * Build a uniform N×M grid layout with optional larger "feature" blocks. Every
 * cell not covered by a feature becomes a single 1×1 slice, so the grid is
 * always gap-free. Density (cols/rows) is the lever for "more games": more,
 * smaller cells — paired with a coverage-safe `zoom` on the collage itself.
 */
export function buildGridLayout(
  nCols: number,
  nRows: number,
  features: { col: number; row: number; w: number; h: number }[] = []
): CollageLayout {
  const occupied = new Set<string>();
  const cells: CollageLayout["cells"] = [];
  for (const f of features) {
    cells.push({ col: `${f.col} / span ${f.w}`, row: `${f.row} / span ${f.h}`, feature: true });
    for (let dc = 0; dc < f.w; dc++)
      for (let dr = 0; dr < f.h; dr++) occupied.add(`${f.col + dc},${f.row + dr}`);
  }
  for (let r = 1; r <= nRows; r++)
    for (let c = 1; c <= nCols; c++)
      if (!occupied.has(`${c},${r}`)) cells.push({ col: c, row: r });
  return {
    cols: Array(nCols).fill("1fr").join(" "),
    rows: Array(nRows).fill("1fr").join(" "),
    cells,
  };
}

/**
 * Dense uniform mosaic for the large detail-page hero — an 11×9 grid of small
 * panels (no oversized focal block, so the density is even edge-to-edge and it
 * reads like a Steam category collage of many games). Pair with a coverage-safe
 * `zoom` (~185) so the tilted grid still fills every corner of the frame.
 */
export const HERO_LAYOUT: CollageLayout = buildGridLayout(11, 9);

export default function RibbonCollage({
  covers,
  color,
  layout,
  rotate = -45,
  zoom = 300,
  tiltX = 50,
}: {
  covers: string[];
  color: string;
  layout: CollageLayout;
  rotate?: number;
  /** grid size as a % of the frame width. Smaller = zoomed out (more cells in
   *  view); larger = zoomed in. The grid must stay big enough to cover the
   *  tilted frame — ~150 is the practical floor. */
  zoom?: number;
  /** forward tilt in degrees (rotateX). Steeper = more dramatic 2.5D but the
   *  plane's horizon can fall inside a wide/short frame, leaving corner gaps;
   *  gentler tilts stay frontal enough to cover. */
  tiltX?: number;
}) {
  if (covers.length === 0) return null;
  const { cols, rows, cells } = layout;

  return (
    <>
      {/* oversized grid, rotated 45° top-left→bottom-right and tilted in real
          3D perspective (frame supplies the perspective; preserve-3d keeps the
          plane dimensional) so the whole mosaic recedes like Steam's category
          collages. The gap reveals the bright backing as thin diagonal seams. */}
      <div
        className="absolute left-1/2 top-1/2 grid aspect-square gap-[6px] [transform-style:preserve-3d]"
        style={{
          width: `${zoom}%`,
          transform: `translate(-50%, -52%) rotateX(${tiltX}deg) rotateY(-8deg) rotateZ(${rotate}deg)`,
          gridTemplateColumns: cols,
          gridTemplateRows: rows,
          background: `linear-gradient(120deg, ${color}66, rgba(255,255,255,0.18) 60%, ${color}44)`,
        }}
        aria-hidden
      >
        {cells.map((c, i) => (
          <div
            key={i}
            className="relative overflow-hidden"
            style={{
              gridColumn: c.col,
              gridRow: c.row,
              zIndex: c.feature ? 20 : 10,
              boxShadow: c.feature
                ? "0 0 50px -6px rgba(0,0,0,0.55)"
                : "0 0 24px -8px rgba(0,0,0,0.5)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={covers[i % covers.length]}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover [filter:saturate(1.16)_contrast(1.05)]"
            />
            {/* seam edge highlight + soft corner shading for slice separation */}
            <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16),inset_0_0_40px_rgba(0,0,0,0.3)]" />
          </div>
        ))}
      </div>

      {/* vibrant brand glows blooming through the seams */}
      <div
        className="pointer-events-none absolute -left-[6%] top-[-20%] h-[80%] w-[38%] rounded-full opacity-35 blur-[70px]"
        style={{ background: color }}
      />
      <div
        className="pointer-events-none absolute right-[-4%] bottom-[-24%] h-[80%] w-[36%] rounded-full opacity-30 blur-[70px]"
        style={{ background: color }}
      />
    </>
  );
}
