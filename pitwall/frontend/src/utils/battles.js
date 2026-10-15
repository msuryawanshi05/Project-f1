/**
 * battles.js — find every on-track fight, not just the one on TV.
 *
 * The broadcast director shows one battle at a time. On a second screen the
 * useful question is the other nine: where should I be looking when the
 * director is on the wrong car.
 *
 * Everything here is pure so the ranking and the exclusions can be tested
 * against real races; see battles.test.mjs, which runs them over the committed
 * Monza replay.
 */

/** Below this, two cars are fighting rather than merely near each other. */
export const BATTLE_THRESHOLD_S = 1.0

/**
 * Track states where intervals are artificial and the panel is suppressed.
 *
 * 4 safety car, 5 red flag, 6 VSC, 7 VSC ending. Under all four the field is
 * delta-limited or stationary: the gaps on screen describe a queue, not a
 * fight, and ranking them would point attention at nothing.
 */
const NEUTRALISED = new Set(['4', '5', '6', '7'])

/**
 * How many laps of history the trend is measured over.
 *
 * Not the last sample. Lap-to-lap interval moves by a tenth or two from
 * traffic, a lock-up or a tow down the straight, so a single-sample delta is
 * mostly noise and flips sign constantly — which on a glanceable panel is
 * worse than no trend at all.
 */
export const TREND_LAPS = 3

/** A gap must move by at least this much per lap to count as a trend. */
export const TREND_DEADBAND_S = 0.08

/**
 * How much a closing rate is worth against raw proximity, in the ranking.
 *
 * At 2.0, closing at 0.5 s/lap scores the same as having already shut a
 * full second of gap. That is about right: a car taking half a second a lap
 * is alongside within two laps, which is as worth watching as one that is
 * alongside now and has been for ten laps.
 */
export const CLOSING_WEIGHT = 2.0

/**
 * Parse an interval that is genuinely a number of seconds.
 *
 * Strict on purpose. F1 writes a lapped car's gap as "1 LAP" or "1L" and a
 * leader's as "" or "LEADER"; `parseFloat("1L")` is 1, which would put a
 * lapped backmarker in the radar as a one-second fight. Anything that is not
 * a plain seconds value is rejected rather than coerced.
 */
export function parseInterval(raw) {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const s = String(raw).trim()
  if (!s) return null
  if (!/^\+?\d+(\.\d+)?$/.test(s)) return null
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : null
}

/** Drivers with an unserved time penalty, parsed from race control. */
export function pendingPenalties(raceControl = []) {
  const out = new Set()
  for (const msg of raceControl) {
    const txt = String(msg?.message ?? '').toUpperCase()
    if (!txt) continue
    if (txt.includes('NO FURTHER ACTION') || txt.includes('PENALTY SERVED')) continue
    // A grid penalty is spent by the time the race runs; a TIME penalty is
    // still owed and changes the result regardless of track position.
    if (!/TIME PENALTY|DRIVE THROUGH|DRIVE-THROUGH|STOP AND GO|STOP\/GO/.test(txt)) continue
    let num = msg?.driver_number != null ? String(msg.driver_number) : null
    if (!num) {
      const m = txt.match(/CAR\s+(\d+)/)
      if (m) num = m[1]
    }
    if (num) out.add(String(num))
  }
  return out
}

/**
 * The interval between two cars, over the last few laps.
 *
 * Reconstructed from each car's gap to the leader, which is what the store
 * accumulates per lap — the difference between the two is the interval, and
 * it is the only per-lap history available.
 *
 * @returns {number[]} oldest first, one entry per lap where both cars appear.
 */
export function intervalHistory(gapHistory = [], aheadNum, chaserNum, laps = TREND_LAPS) {
  const out = []
  for (const row of gapHistory.slice(-(laps + 1))) {
    const a = row[`gap_${aheadNum}`]
    const b = row[`gap_${chaserNum}`]
    if (typeof a !== 'number' || typeof b !== 'number') continue
    out.push(b - a)
  }
  return out
}

/**
 * Seconds per lap the interval is changing. Negative means closing.
 *
 * A straight first-to-last slope over the window rather than a fit: with three
 * or four points a least-squares line is a more precise answer to a question
 * the data cannot support, and it reacts more slowly to the lap that matters.
 */
export function trendPerLap(history = []) {
  if (history.length < 2) return null
  const first = history[0]
  const last = history[history.length - 1]
  return (last - first) / (history.length - 1)
}

export function trendLabel(perLap) {
  if (perLap == null) return 'unknown'
  if (perLap <= -TREND_DEADBAND_S) return 'closing'
  if (perLap >= TREND_DEADBAND_S) return 'growing'
  return 'stable'
}

/**
 * How much this battle deserves a glance.
 *
 *   closeness = (1 - interval) + CLOSING_WEIGHT * closingRate
 *
 * The first term is proximity: a car half a second behind scores 0.5, one a
 * tenth behind scores 0.9. The second is only the CLOSING half of the trend —
 * a gap that is growing adds nothing but is not penalised either, because a
 * driver defending a shrinking lead is still a fight.
 *
 * Worked through the case that motivates the weighting: 0.9s and closing at
 * 0.4 s/lap scores 0.1 + 0.8 = 0.9, while 0.3s holding station scores 0.7. The
 * pair that will be alongside in two laps ranks above the pair that has been
 * three tenths apart all afternoon, which is the right way round for someone
 * deciding where to look next.
 */
export function closeness(intervalS, trend) {
  const proximity = Math.max(0, BATTLE_THRESHOLD_S - intervalS) / BATTLE_THRESHOLD_S
  const closingRate = trend != null && trend < 0 ? -trend : 0
  return proximity + CLOSING_WEIGHT * closingRate
}

/**
 * Every battle on track right now, most worth watching first.
 *
 * @param {object} input
 * @param {Array}  input.timing        store.timing
 * @param {Array}  input.gapHistory    store.gapHistory
 * @param {object} input.trackStatus   store.trackStatus
 * @param {Array}  input.raceControl   store.raceControl
 * @param {object} input.momByDriver   { [number]: 'off'|'available'|'on' }
 * @param {object} input.since         { [pairKey]: lap } when each battle began
 * @param {number} input.currentLap
 * @returns {{ battles: Array, suppressed: string|null, since: object }}
 */
export function findBattles({
  timing = [],
  gapHistory = [],
  trackStatus = {},
  raceControl = [],
  momByDriver = {},
  since = {},
  currentLap = null,
} = {}) {
  const status = String(trackStatus?.status ?? '1')
  if (NEUTRALISED.has(status)) {
    return { battles: [], suppressed: status, since }
  }

  const running = timing
    // `Number(null)` is 0, which is finite — a retired car with no position
    // would otherwise sort to the front and be paired with the leader.
    .filter((d) => d.position != null && Number.isFinite(Number(d.position)))
    .sort((a, b) => Number(a.position) - Number(b.position))

  const penalised = pendingPenalties(raceControl)
  const nextSince = { ...since }
  const seen = new Set()
  const battles = []

  for (let i = 1; i < running.length; i++) {
    const ahead = running[i - 1]
    const chaser = running[i]
    const aheadNum = String(ahead.driver_number ?? ahead.number)
    const chaserNum = String(chaser.driver_number ?? chaser.number)

    // Not racing each other, for four separate reasons.
    if (chaser.retired || ahead.retired || chaser.stopped || ahead.stopped) continue
    if (chaser.in_pit || ahead.in_pit || chaser.pitting || ahead.pitting) continue
    // Lapped traffic: adjacent in the classification, nowhere near each other
    // on track. The interval the feed prints for them is meaningless.
    const la = Number(ahead.lap)
    const lc = Number(chaser.lap)
    if (Number.isFinite(la) && Number.isFinite(lc) && Math.abs(la - lc) > 1) continue
    // A time penalty still to be served decides the order off track, so the
    // on-track gap no longer describes who finishes ahead.
    if (penalised.has(aheadNum) || penalised.has(chaserNum)) continue

    const interval = parseInterval(chaser.gap_to_ahead)
    if (interval == null || interval <= 0 || interval >= BATTLE_THRESHOLD_S) continue

    const key = `${aheadNum}-${chaserNum}`
    seen.add(key)
    if (nextSince[key] == null && Number.isFinite(Number(currentLap))) {
      nextSince[key] = Number(currentLap)
    }

    const history = intervalHistory(gapHistory, aheadNum, chaserNum)
    const trend = trendPerLap(history)
    const startedLap = nextSince[key] ?? null

    battles.push({
      key,
      interval,
      ahead: {
        number: Number(aheadNum),
        code: ahead.driver ?? ahead.code ?? aheadNum,
        position: Number(ahead.position),
      },
      chaser: {
        number: Number(chaserNum),
        code: chaser.driver ?? chaser.code ?? chaserNum,
        position: Number(chaser.position),
        // The chaser's overtake mode is the one that decides whether a pass is
        // on. Null rather than 'off' when unknown: a replay carries no live
        // car telemetry, and claiming the car has no mode available would be a
        // statement we cannot support.
        mom: momByDriver[chaserNum] ?? momByDriver[Number(chaserNum)] ?? null,
      },
      trend,
      trendLabel: trendLabel(trend),
      samples: history.length,
      startedLap,
      laps: startedLap != null && Number.isFinite(Number(currentLap))
        ? Math.max(1, Number(currentLap) - startedLap + 1)
        : null,
      score: closeness(interval, trend),
    })
  }

  // Forget pairs that are no longer fighting, so a battle that reforms later
  // reads as new rather than claiming to have run for forty laps.
  for (const key of Object.keys(nextSince)) {
    if (!seen.has(key)) delete nextSince[key]
  }

  battles.sort((a, b) => b.score - a.score || a.interval - b.interval)
  return { battles, suppressed: null, since: nextSince }
}

/** Why the panel is empty, in words. */
export function suppressionReason(status) {
  switch (String(status)) {
    case '4': return 'Safety car — the field is queued, not racing.'
    case '5': return 'Red flag — the session is stopped.'
    case '6': return 'Virtual safety car — everyone is delta-limited.'
    case '7': return 'VSC ending — intervals are still artificial.'
    default: return null
  }
}

export default findBattles
