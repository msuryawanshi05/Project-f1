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
 * Both the header and every row build their cells by iterating the SAME column
 * list, so a column cannot exist in one and not the other.
 *
 * Minimums are derived from the widest string each column must hold, measured
 * in Orbitron (the `.timing-number` face, which is notably wide):
 *   BEST/LAST LAP  "1:32.741"  -> 90px
 *   S1/S2/S3       "47.294"    -> 76px
 *   GAP            "+1 LAP"    -> 74px
 */

/** Every column the tower can show, keyed for lookup. */
const COLUMN = {
  accent:  { key: 'accent',  label: '',         grid: '4px',                align: 'center' },
  pos:     { key: 'pos',     label: 'POS',      grid: '38px',               align: 'center' },
  car:     { key: 'car',     label: 'CAR',      grid: '32px',               align: 'center' },
  drv:     { key: 'drv',     label: 'DRV',      grid: 'minmax(72px, 1fr)',  align: 'left'   },
  gap:     { key: 'gap',     label: 'GAP',      grid: 'minmax(74px, 1fr)',  align: 'left'   },
  int:     { key: 'int',     label: 'INT',      grid: 'minmax(70px, 1fr)',  align: 'left'   },
  bestLap: { key: 'bestLap', label: 'BEST LAP', grid: 'minmax(90px, 1fr)',  align: 'left'   },
  lastLap: { key: 'lastLap', label: 'LAST LAP', grid: 'minmax(90px, 1fr)',  align: 'left'   },
  s1:      { key: 's1',      label: 'S1',       grid: 'minmax(76px, auto)', align: 'center' },
  s2:      { key: 's2',      label: 'S2',       grid: 'minmax(76px, auto)', align: 'center' },
  s3:      { key: 's3',      label: 'S3',       grid: 'minmax(76px, auto)', align: 'center' },
  tyre:    { key: 'tyre',    label: 'TYRE',     grid: '52px',               align: 'center' },
  pit:     { key: 'pit',     label: 'PIT',      grid: '32px',               align: 'center' },
  mom:     { key: 'mom',     label: 'MOM',      grid: '28px',               align: 'center' },
  expand:  { key: 'expand',  label: '',         grid: '24px',               align: 'center' },
}

/**
 * Race / practice tower.
 *
 * GAP is to the leader and INT to the car ahead — the distinction real F1 makes
 * and the one that tells you whether a driver is actually in a fight. The
 * backend has always sent both (`gap_to_leader`, `gap_to_ahead`); only GAP was
 * ever rendered, and battle detection re-derived the interval by subtracting
 * leader gaps.
 */
export const TOWER_COLUMNS_RACE = [
  COLUMN.accent, COLUMN.pos, COLUMN.car, COLUMN.drv,
  COLUMN.gap, COLUMN.int, COLUMN.lastLap,
  COLUMN.s1, COLUMN.s2, COLUMN.s3,
  COLUMN.tyre, COLUMN.pit, COLUMN.mom, COLUMN.expand,
]

/**
 * Qualifying tower.
 *
 * BEST LAP is the column that matters — qualifying position is decided by it,
 * not by the last lap — so it sits ahead of LAST LAP. PIT count and MOM are
 * dropped: neither is meaningful across a 3-segment knockout session.
 */
export const TOWER_COLUMNS_QUALI = [
  COLUMN.accent, COLUMN.pos, COLUMN.car, COLUMN.drv,
  COLUMN.gap, COLUMN.int, COLUMN.bestLap, COLUMN.lastLap,
  COLUMN.s1, COLUMN.s2, COLUMN.s3,
  COLUMN.tyre, COLUMN.expand,
]

/** Pick the column set for a tower mode: 'QUALI' | 'RACE'. */
export function getTowerColumns(mode) {
  return mode === 'QUALI' ? TOWER_COLUMNS_QUALI : TOWER_COLUMNS_RACE
}

/** `grid-template-columns` for a column set. Header and rows share this. */
export function towerGridTemplate(columns) {
  return columns.map((c) => c.grid).join(' ')
}

/**
 * Sum of the fixed/minimum track widths for a column set. Used as the tower's
 * `min-width` so the container scrolls instead of compressing columns past
 * their legible minimum.
 */
export function towerMinWidth(columns) {
  return columns.reduce((total, c) => {
    const match = /minmax\((\d+)px/.exec(c.grid) ?? /^(\d+)px$/.exec(c.grid)
    return total + (match ? Number(match[1]) : 0)
  }, 0)
}

/** Row height by density setting. */
export const TOWER_ROW_HEIGHT = { compact: 'h-8', comfortable: 'h-10' }
