/**
 * startingGrid.js — turn a qualifying classification into a starting grid.
 *
 * Qualifying order is NOT the grid. Between the chequered flag and lights out
 * the stewards move drivers: place penalties, back-of-grid penalties, pit-lane
 * starts, qualifying disqualifications. The Live tower spends hours in this
 * phase (Saturday evening through Sunday afternoon), so showing the raw
 * qualifying order and calling it the grid is wrong for most of the time the
 * screen is up.
 *
 * Three levels of confidence, never conflated:
 *
 *   'official'    — grid positions came from the results feed. Authoritative.
 *   'adjusted'    — qualifying order with penalties parsed from race control
 *                   applied. Correct in the ordinary cases, and labelled as
 *                   derived.
 *   'provisional' — qualifying order, nothing known about penalties. Labelled
 *                   PROVISIONAL GRID so it is never mistaken for the real one.
 *
 * Everything here is pure so the penalty maths is testable; see
 * startingGrid.test.mjs.
 */

/** Penalty kinds that send a driver to the back rather than down N places. */
const BACK_OF_GRID = 'BACK_OF_GRID'
const PIT_LANE = 'PIT_LANE'

/**
 * Extract grid penalties from race control messages.
 *
 * Deliberately conservative: a message has to say grid/place penalty, pit lane
 * start, back of the grid, or disqualified from qualifying. In-race time
 * penalties ("5 SECOND TIME PENALTY") are a different mechanism handled by the
 * tower's penalty column — counting one as a grid drop would move the wrong
 * driver before the race had even started.
 *
 * @param {Array} messages  store.raceControl entries (newest first, as the
 *                          store holds them).
 * @returns {Object} { [driverNumber]: { places, kind, reason, order } }
 */
export function parseGridPenalties(messages = []) {
  const out = {}
  const seen = new Set()

  // Oldest first: the FIA applies penalties in the order they were imposed,
  // and with two penalised drivers that order changes the resulting grid.
  const ordered = [...messages].reverse()

  ordered.forEach((msg, order) => {
    const txt = String(msg?.message ?? msg?.msg ?? '')
    if (!txt) return
    const upper = txt.toUpperCase()

    if (upper.includes('NO FURTHER ACTION')) return
    // "UNDER INVESTIGATION" is not a penalty yet. Drawing a grid drop for one
    // would announce a decision the stewards have not made.
    if (upper.includes('INVESTIGATION') && !upper.includes('PENALTY')) return
    // A time penalty is served during the race, not on the grid.
    if (/TIME\s+PENALTY/.test(upper) && !upper.includes('GRID')) return

    let number = msg?.driver_number != null ? String(msg.driver_number) : null
    if (!number) {
      const m = upper.match(/CAR\s+(\d+)/)
      if (m) number = m[1]
    }
    if (!number) return

    const key = `${number}|${txt.trim()}`
    if (seen.has(key)) return

    let penalty = null

    if (/PIT\s*LANE/.test(upper) && /START/.test(upper)) {
      penalty = { places: Infinity, kind: PIT_LANE, reason: txt.trim(), order }
    } else if (/BACK\s+OF\s+THE\s+(GRID|FIELD)/.test(upper)
      || /DISQUALIFIED\s+FROM\s+QUALIFYING/.test(upper)) {
      penalty = { places: Infinity, kind: BACK_OF_GRID, reason: txt.trim(), order }
    } else if (upper.includes('GRID')) {
      // "10 PLACE GRID PENALTY", "5 GRID POSITION PENALTY", "3 GRID PLACE
      // PENALTY" — the number and the two words appear in several orders.
      const m = upper.match(/(\d+)\s*(?:PLACE|POSITION|GRID)[\s\w]{0,24}?PENALTY/)
      if (m) penalty = { places: Number(m[1]), kind: 'PLACES', reason: txt.trim(), order }
    }

    if (!penalty) return
    seen.add(key)

    const existing = out[number]
    if (!existing) {
      out[number] = penalty
      return
    }
    // A pit-lane or back-of-grid penalty subsumes a place drop; otherwise place
    // penalties accumulate (a driver can collect two over one weekend).
    if (!Number.isFinite(existing.places)) return
    if (!Number.isFinite(penalty.places)) {
      out[number] = penalty
      return
    }
    out[number] = { ...penalty, places: existing.places + penalty.places }
  })

  return out
}

/**
 * Apply penalties to a qualifying classification.
 *
 * The FIA procedure: each penalised driver drops the stated number of places
 * from where they sit, applied in the order the penalties were imposed, and
 * everyone they pass moves up one. Back-of-grid and pit-lane starts go last,
 * pit lane behind back-of-grid.
 *
 * Note the model: a drop is measured from the driver's position in the order
 * PRODUCED BY THE PENALTIES ALREADY APPLIED, not from their raw qualifying
 * position. With two penalised drivers the two readings diverge, which is why
 * the imposition order is carried through from race control rather than
 * discarded. The resulting grid is labelled as derived, not official.
 *
 * @param {Array}  qualifying  ordered [{ position, number, ... }]
 * @param {Object} penalties   from parseGridPenalties
 * @returns {Array} ordered grid rows with gridPosition / qualiPosition / delta
 */
export function applyGridPenalties(qualifying = [], penalties = {}) {
  let order = [...qualifying]
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
    .map((q, i) => ({ ...q, qualiPosition: Number(q.position ?? i + 1) }))

  const relegated = []

  const byOrder = Object.entries(penalties)
    .map(([number, p]) => ({ number, ...p }))
    .sort((a, b) => a.order - b.order)

  for (const pen of byOrder) {
    const idx = order.findIndex((r) => String(r.number) === String(pen.number))
    if (idx === -1) continue
    const [row] = order.splice(idx, 1)
    row.penalty = pen

    if (!Number.isFinite(pen.places)) {
      relegated.push(row)
      continue
    }
    // Drop `places` positions from where the driver currently sits, clamped at
    // the back of the field rather than wrapping around it.
    order.splice(Math.min(idx + pen.places, order.length), 0, row)
  }

  // Pit lane starts line up behind back-of-grid penalties.
  relegated.sort((a, b) => {
    const rank = (r) => (r.penalty?.kind === PIT_LANE ? 1 : 0)
    return rank(a) - rank(b) || a.qualiPosition - b.qualiPosition
  })
  order = order.concat(relegated)

  return order.map((row, i) => {
    const gridPosition = row.penalty?.kind === PIT_LANE ? null : i + 1
    return {
      ...row,
      gridPosition,
      // Positive means places gained, negative means dropped. null for a pit
      // lane start, which has no grid slot to compare against.
      delta: gridPosition == null ? null : row.qualiPosition - gridPosition,
    }
  })
}

/**
 * Build the grid to display.
 *
 * @param {object} input
 * @param {Array}  input.qualifying   qualifying classification (ordered)
 * @param {Array}  input.raceControl  live race control messages
 * @param {Array}  input.officialGrid optional [{ number, grid }] from a results
 *                                    feed. Preferred over anything derived.
 * @returns {{ rows: Array, source: 'official'|'adjusted'|'provisional',
 *             label: string, penaltyCount: number }}
 */
export function buildStartingGrid({ qualifying = [], raceControl = [], officialGrid = null } = {}) {
  if (!qualifying.length) {
    return { rows: [], source: 'provisional', label: 'PROVISIONAL GRID', penaltyCount: 0 }
  }

  if (officialGrid?.length) {
    const gridByNumber = new Map(officialGrid.map((g) => [String(g.number), Number(g.grid)]))
    // grid === 0 in the results feed means a pit lane start.
    const rows = qualifying
      .map((q, i) => {
        const g = gridByNumber.get(String(q.number))
        const qualiPosition = Number(q.position ?? i + 1)
        const gridPosition = Number.isFinite(g) && g > 0 ? g : null
        return {
          ...q,
          qualiPosition,
          gridPosition,
          delta: gridPosition == null ? null : qualiPosition - gridPosition,
        }
      })
      .sort((a, b) => (a.gridPosition ?? 999) - (b.gridPosition ?? 999))
    if (rows.some((r) => r.gridPosition != null)) {
      return {
        rows,
        source: 'official',
        label: 'STARTING GRID',
        penaltyCount: rows.filter((r) => r.delta !== 0).length,
      }
    }
  }

  const penalties = parseGridPenalties(raceControl)
  const penaltyCount = Object.keys(penalties).length

  if (!penaltyCount) {
    // No penalty information at all. This is qualifying order, and saying so is
    // the point — on most weekends it IS the grid, but we have not verified it.
    const rows = [...qualifying]
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
      .map((q, i) => ({
        ...q,
        qualiPosition: Number(q.position ?? i + 1),
        gridPosition: i + 1,
        delta: 0,
      }))
    return { rows, source: 'provisional', label: 'PROVISIONAL GRID', penaltyCount: 0 }
  }

  return {
    rows: applyGridPenalties(qualifying, penalties),
    source: 'adjusted',
    label: 'STARTING GRID',
    penaltyCount,
  }
}

/** One-line note on where the grid came from, for the tower subheader. */
export function gridSourceNote(source, penaltyCount = 0) {
  switch (source) {
    case 'official':
      return 'Grid positions from the official classification.'
    case 'adjusted':
      return `Qualifying order with ${penaltyCount} grid ${penaltyCount === 1 ? 'penalty' : 'penalties'} applied, in the order race control issued them. Derived, not official.`
    default:
      return 'Qualifying order. No grid penalties published — positions may still change.'
  }
}

export { BACK_OF_GRID, PIT_LANE }
