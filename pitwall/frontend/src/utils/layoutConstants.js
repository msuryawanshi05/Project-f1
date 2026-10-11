/**
 * layoutConstants.js — the single source of truth for the timing tower grid.
 *
 * Why this file exists
 * --------------------
 * The tower header (Live.jsx) and the tower rows (DriverRow.jsx) each used to
 * carry their own copy of a `colWidths` object built from percentages
 * (`w-[11%] min-w-[52px]`). Two problems followed:
 *
 *  1. Drift. Two copies of the same layout had to be edited in lockstep to stay
 *     aligned, and nothing enforced it.
 *  2. Clipping. A percentage width is computed against the tower's actual
 *     rendered width, which is 58% of a split pane — not the viewport. At that
 *     size 11% resolves to roughly 57px, while "47.294" in 12px Orbitron needs
 *     about 54px of glyphs plus padding. The row sets `overflow-hidden` for its
 *     expand animation, so the last digit was simply cut off and sector times
 *     read "47.29".
 *
 * Fixed pixel minimums via `minmax()` make clipping structurally impossible:
 * the grid cannot size a timing column below the width its digits need. When
 * the container is narrower than the sum of the minimums the whole tower scrolls
 * horizontally, which is the correct failure mode for tabular data — far better
 * than silently truncating a lap time.
 *
 * TIMING_MIN_PX values are derived from the widest string each column must hold,
 * measured in Orbitron (the `.timing-number` face, which is notably wide):
 *   LAST LAP  "1:32.741"  -> 92px
 *   S1/S2/S3  "47.294"    -> 76px
 *   GAP       "+1 LAP"    -> 78px
 */

/** Ordered tower columns. `label` is the header text; `grid` is its track size. */
export const TOWER_COLUMNS = [
  { key: 'accent',  label: '',         grid: '4px',            align: 'center' },
  { key: 'pos',     label: 'POS',      grid: '40px',           align: 'center' },
  { key: 'drv',     label: 'DRV',      grid: 'minmax(74px, 1fr)',  align: 'left' },
  { key: 'gap',     label: 'GAP',      grid: 'minmax(78px, 1fr)',  align: 'left' },
  { key: 'lastLap', label: 'LAST LAP', grid: 'minmax(92px, 1fr)',  align: 'left' },
  { key: 's1',      label: 'S1',       grid: 'minmax(76px, auto)', align: 'center' },
  { key: 's2',      label: 'S2',       grid: 'minmax(76px, auto)', align: 'center' },
  { key: 's3',      label: 'S3',       grid: 'minmax(76px, auto)', align: 'center' },
  { key: 'tyre',    label: 'TYRE',     grid: '54px',           align: 'center' },
  { key: 'pit',     label: 'PIT',      grid: '34px',           align: 'center' },
  { key: 'expand',  label: '',         grid: '26px',           align: 'center' },
]

/**
 * `grid-template-columns` for both the header and every row. Applied as an
 * inline style so the two can never diverge — if a column changes here, the
 * header and the rows change together, by construction.
 */
export const TOWER_GRID_TEMPLATE = TOWER_COLUMNS.map((c) => c.grid).join(' ')

/**
 * Sum of the fixed/minimum track widths. Used as the tower's `min-width` so the
 * container scrolls instead of compressing columns past their legible minimum.
 */
export const TOWER_MIN_WIDTH_PX = TOWER_COLUMNS.reduce((total, c) => {
  const match = /minmax\((\d+)px/.exec(c.grid) ?? /^(\d+)px$/.exec(c.grid)
  return total + (match ? Number(match[1]) : 0)
}, 0)

/** Row height by density setting. */
export const TOWER_ROW_HEIGHT = { compact: 'h-8', comfortable: 'h-10' }

export default TOWER_GRID_TEMPLATE
