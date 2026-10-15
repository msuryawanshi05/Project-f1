/**
 * undercut.js — which cars look like they are about to pit.
 *
 * The heuristic, in one sentence: a car is in a plausible pit window when its
 * tyres are old enough for the compound AND its recent laps have dropped off
 * its own best pace, and it becomes interesting when a car it is racing has
 * just pitted or is in the same window.
 *
 * That is all it is. It is inference from lap times and tyre age, not a
 * strategy model and not information from the pit wall, so every row says how
 * confident it is and the panel says what the signal is made of. A number that
 * looks like a prediction and is wrong is worse than no number.
 *
 * Deliberately NOT attempted: fuel correction, track evolution, traffic
 * compensation, a stint-length model per circuit. Each needs data this app
 * does not have, and each would make the output look more authoritative
 * without making it more right.
 */

/**
 * Typical usable life, in laps, before a compound is past its best.
 *
 * Not a cliff and not a rule — a soft on a cold Monza evening lasts longer
 * than a soft at Barcelona in August. These are the round numbers a commentator
 * would use, and they exist only to answer "is this tyre old yet".
 */
export const COMPOUND_LIFE = {
  SOFT: 16,
  MEDIUM: 25,
  HARD: 35,
  INTERMEDIATE: 25,
  WET: 30,
}

/** Below this fraction of a compound's life, age tells us nothing. */
const AGE_FLOOR = 0.6

/** A lap this much slower than the driver's own best counts as drop-off. */
export const DROPOFF_S = 0.8

/** How many recent laps the pace comparison uses. */
export const PACE_LAPS = 3

export const Confidence = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
}

/**
 * Average of a driver's recent lap times, from the gap history the store keeps.
 *
 * Lap times themselves are not retained per lap — only the current one — so
 * recent pace is read from how the gap to the leader has moved. A car losing
 * time to the leader is slowing relative to it, which is the comparison that
 * matters for "is this stint done".
 */
export function recentPaceLoss(gapHistory = [], driverNum, laps = PACE_LAPS) {
  const rows = gapHistory.slice(-(laps + 1))
  const vals = []
  for (const row of rows) {
    const g = row[`gap_${driverNum}`]
    if (typeof g === 'number') vals.push(g)
  }
  if (vals.length < 2) return null
  return (vals[vals.length - 1] - vals[0]) / (vals.length - 1)
}

/**
 * Pit-window candidates, most likely first.
 *
 * @param {object} input
 * @param {Array}  input.timing      store.timing
 * @param {Array}  input.tyres       store.tyres
 * @param {Array}  input.gapHistory  store.gapHistory
 * @param {object} input.trackStatus store.trackStatus
 * @param {number} input.currentLap
 * @param {number} input.totalLaps
 */
export function findPitWindow({
  timing = [],
  tyres = [],
  gapHistory = [],
  trackStatus = {},
  currentLap = null,
  totalLaps = null,
} = {}) {
  // Under a safety car everyone is a candidate and the heuristic adds nothing
  // — the whole pit lane is the answer and the TV will show it anyway.
  if (['4', '5', '6', '7'].includes(String(trackStatus?.status ?? '1'))) {
    return { candidates: [], suppressed: true }
  }

  const tyreBy = new Map(
    tyres.map((t) => [String(t.driver_number ?? t.number), t]),
  )
  // Who has already stopped recently tells us the window is open: the first
  // car to pit is the one that makes the others' stops interesting.
  const recentStops = timing.filter((d) => d.in_pit || d.pitting).length

  const out = []
  for (const d of timing) {
    const num = String(d.driver_number ?? d.number)
    // `Number(null)` is 0 and finite; a car with no position is out.
    if (d.position == null || !Number.isFinite(Number(d.position))) continue
    if (d.in_pit || d.pitting || d.retired || d.stopped) continue

    const tyre = tyreBy.get(num)
    const compound = String(tyre?.compound ?? '').toUpperCase()
    const age = Number(tyre?.age)
    if (!Number.isFinite(age) || !COMPOUND_LIFE[compound]) continue

    const life = COMPOUND_LIFE[compound]
    const wear = age / life
    if (wear < AGE_FLOOR) continue

    // A car cannot usefully pit if there is not enough race left to use the
    // tyres — and in the last few laps everyone is staying out regardless.
    if (Number.isFinite(Number(totalLaps)) && Number.isFinite(Number(currentLap))) {
      if (Number(totalLaps) - Number(currentLap) < 5) continue
    }

    const paceLoss = recentPaceLoss(gapHistory, num)
    const droppingOff = paceLoss != null && paceLoss >= DROPOFF_S

    // Two independent signals. Both is a real indication; age alone is a
    // guess, which is what the confidence label says.
    let confidence = Confidence.LOW
    if (wear >= 1.0 && droppingOff) confidence = Confidence.HIGH
    else if (wear >= 1.0 || droppingOff) confidence = Confidence.MEDIUM

    const reasons = []
    reasons.push(`${age} laps on ${compound.toLowerCase()}`)
    if (droppingOff) reasons.push(`losing ${paceLoss.toFixed(1)}s a lap`)
    if (recentStops > 0) reasons.push('stops have started')

    out.push({
      number: Number(num),
      code: d.driver ?? d.code ?? num,
      position: Number(d.position),
      compound,
      age,
      wear,
      paceLoss,
      droppingOff,
      confidence,
      reasons,
      // Ranking: tyre age relative to its compound, with a real pace drop-off
      // counting for about as much as a third of a stint of extra age.
      score: wear + (droppingOff ? 0.35 : 0) + (recentStops > 0 ? 0.1 : 0),
    })
  }

  out.sort((a, b) => b.score - a.score)
  return { candidates: out, suppressed: false }
}

/** One line stating exactly what the panel is and is not. */
export const UNDERCUT_DISCLAIMER =
  'Inferred from tyre age and recent pace only. Not a prediction, and not from the pit wall.'

export default findPitWindow
