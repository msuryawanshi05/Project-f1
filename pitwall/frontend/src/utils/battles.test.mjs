/**
 * battles.test.mjs — node src/utils/battles.test.mjs
 *
 * The radar's job is to be right at a two-second glance, which means the
 * things that must not happen are specific: a lapped backmarker appearing as a
 * one-second fight, a car in the pit lane appearing to be racing, the panel
 * ranking a static gap above one that is closing, and the whole thing staying
 * up under a safety car where the intervals are a queue rather than a fight.
 *
 * The exclusion cases are checked against the committed Monza replay where it
 * has them — that race has a safety car, a red flag, a VSC, cars multiple laps
 * down and a retirement, which is most of the list.
 */

import { gunzipSync } from 'node:zlib'
import { readFileSync, existsSync } from 'node:fs'
import {
  findBattles, parseInterval, pendingPenalties, intervalHistory,
  trendPerLap, trendLabel, closeness, suppressionReason,
  BATTLE_THRESHOLD_S, CLOSING_WEIGHT,
} from './battles.js'

let pass = 0
const fails = []
function ok(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`) }
  else { fails.push(label); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}
const eq = (label, a, b) => ok(label, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
const group = (n) => console.log(`\n${n}`)

/** A tower row with sensible defaults. */
const car = (position, number, code, gapAhead, extra = {}) => ({
  position, number, driver: code, gap_to_ahead: gapAhead,
  lap: 20, in_pit: false, pitting: false, retired: false, stopped: false,
  ...extra,
})

// ── parsing ────────────────────────────────────────────────────────────────
group('parseInterval — strict about what is a number of seconds')
eq('plain seconds', parseInterval('0.412'), 0.412)
eq('signed seconds', parseInterval('+0.412'), 0.412)
eq('numeric', parseInterval(0.5), 0.5)
ok('a lapped car is not a 1.0s gap', parseInterval('1L') === null)
ok('"1 LAP" rejected', parseInterval('1 LAP') === null)
ok('"LAP" rejected', parseInterval('LAP') === null)
ok('"LEADER" rejected', parseInterval('LEADER') === null)
ok('empty rejected', parseInterval('') === null)
ok('null rejected', parseInterval(null) === null)

// ── trend ──────────────────────────────────────────────────────────────────
group('trend — measured over laps, not samples')
eq('closing', trendLabel(trendPerLap([0.9, 0.7, 0.5])), 'closing')
eq('growing', trendLabel(trendPerLap([0.3, 0.5, 0.8])), 'growing')
eq('a tenth of wobble is stable', trendLabel(trendPerLap([0.50, 0.56, 0.52])), 'stable')
eq('one sample has no trend', trendPerLap([0.4]), null)
eq('no samples, no trend', trendPerLap([]), null)
{
  const h = intervalHistory(
    [{ lap: 1, gap_1: 0, gap_2: 1.2 }, { lap: 2, gap_1: 0, gap_2: 0.9 }, { lap: 3, gap_1: 0, gap_2: 0.6 }],
    '1', '2')
  eq('interval history is the difference of the two gaps', JSON.stringify(h), JSON.stringify([1.2, 0.9, 0.6]))
  ok('and it reads as closing', trendLabel(trendPerLap(h)) === 'closing')
}
{
  // A lap where one car is missing is skipped rather than treated as zero.
  const h = intervalHistory([{ lap: 1, gap_1: 0, gap_2: 0.8 }, { lap: 2, gap_1: 0 }], '1', '2')
  eq('missing car means missing lap', h.length, 1)
}

// ── ranking ────────────────────────────────────────────────────────────────
group('closeness — a closing gap outranks a static one')
{
  const closingFar = closeness(0.9, -0.4)
  const staticNear = closeness(0.3, 0)
  ok('0.9s closing beats 0.3s holding station',
    closingFar > staticNear, `${closingFar.toFixed(2)} vs ${staticNear.toFixed(2)}`)
  eq('the worked example is 0.9', Number(closingFar.toFixed(3)), 0.9)
  eq('and the static one is 0.7', Number(staticNear.toFixed(3)), 0.7)
}
ok('a growing gap is not penalised below its proximity',
  closeness(0.4, +0.5) === closeness(0.4, 0))
ok('closer is better, all else equal', closeness(0.2, 0) > closeness(0.8, 0))
ok('the weight is the documented one', CLOSING_WEIGHT === 2.0)

// ── exclusions ─────────────────────────────────────────────────────────────
group('exclusions — cars that are not racing each other')
{
  const base = [car(1, 1, 'NOR', ''), car(2, 16, 'LEC', '+0.4')]
  eq('a plain pair is a battle', findBattles({ timing: base }).battles.length, 1)
}
{
  const t = [car(1, 1, 'NOR', ''), car(2, 16, 'LEC', '+0.4', { in_pit: true })]
  eq('car in the pits excluded', findBattles({ timing: t }).battles.length, 0)
}
{
  const t = [car(1, 1, 'NOR', '', { in_pit: true }), car(2, 16, 'LEC', '+0.4')]
  eq('car ahead in the pits excluded', findBattles({ timing: t }).battles.length, 0)
}
{
  const t = [car(1, 1, 'NOR', ''), car(2, 16, 'LEC', '+0.4', { retired: true })]
  eq('retired car excluded', findBattles({ timing: t }).battles.length, 0)
}
{
  const t = [car(1, 1, 'NOR', '', { lap: 40 }), car(2, 16, 'LEC', '+0.4', { lap: 25 })]
  eq('lapped traffic excluded', findBattles({ timing: t }).battles.length, 0)
}
{
  // One lap apart happens legitimately at the line and must NOT be excluded.
  const t = [car(1, 1, 'NOR', '', { lap: 40 }), car(2, 16, 'LEC', '+0.4', { lap: 39 })]
  eq('a lap apart at the line is still a battle', findBattles({ timing: t }).battles.length, 1)
}
{
  const t = [car(1, 1, 'NOR', ''), car(2, 16, 'LEC', '+0.4')]
  const rc = [{ message: 'CAR 16 (LEC) 5 SECOND TIME PENALTY - TRACK LIMITS' }]
  eq('pending time penalty excluded', findBattles({ timing: t, raceControl: rc }).battles.length, 0)
}
{
  const t = [car(1, 1, 'NOR', ''), car(2, 16, 'LEC', '+0.4')]
  const rc = [{ message: 'CAR 16 (LEC) - 10 PLACE GRID PENALTY' }]
  eq('a grid penalty is spent and does not exclude',
    findBattles({ timing: t, raceControl: rc }).battles.length, 1)
}
{
  const t = [car(1, 1, 'NOR', ''), car(2, 16, 'LEC', '+1.4')]
  eq('over the threshold is not a battle', findBattles({ timing: t }).battles.length, 0)
}
{
  const t = [car(1, 1, 'NOR', ''), car(2, 16, 'LEC', '1L')]
  eq('a lap-formatted gap is not a 1s battle', findBattles({ timing: t }).battles.length, 0)
}
{
  const t = [car(1, 1, 'NOR', ''), car(null, 16, 'LEC', '+0.4')]
  eq('a car with no position is skipped', findBattles({ timing: t }).battles.length, 0)
}

group('pendingPenalties')
{
  const p = pendingPenalties([
    { message: 'CAR 4 (NOR) 5 SECOND TIME PENALTY' },
    { message: 'CAR 16 (LEC) - NO FURTHER ACTION' },
    { message: 'CAR 1 (VER) DRIVE THROUGH PENALTY' },
    { message: 'YELLOW FLAG IN SECTOR 3' },
  ])
  ok('time penalty found', p.has('4'))
  ok('drive-through found', p.has('1'))
  ok('no further action ignored', !p.has('16'))
  eq('nothing else', p.size, 2)
}

// ── suppression ────────────────────────────────────────────────────────────
group('suppression — intervals are artificial under neutralisation')
for (const [code, name] of [['4', 'safety car'], ['5', 'red flag'], ['6', 'VSC'], ['7', 'VSC ending']]) {
  const t = [car(1, 1, 'NOR', ''), car(2, 16, 'LEC', '+0.4')]
  const r = findBattles({ timing: t, trackStatus: { status: code } })
  ok(`${name} suppresses the panel`, r.battles.length === 0 && r.suppressed === code)
  ok(`${name} has a reason to show`, Boolean(suppressionReason(code)))
}
{
  const t = [car(1, 1, 'NOR', ''), car(2, 16, 'LEC', '+0.4')]
  ok('yellow flag does NOT suppress — cars are still racing',
    findBattles({ timing: t, trackStatus: { status: '2' } }).battles.length === 1)
}

// ── duration ───────────────────────────────────────────────────────────────
group('duration — how long this fight has been going')
{
  const t = [car(1, 1, 'NOR', ''), car(2, 16, 'LEC', '+0.4')]
  const a = findBattles({ timing: t, currentLap: 10 })
  eq('a new battle starts at one lap', a.battles[0].laps, 1)
  const b = findBattles({ timing: t, currentLap: 14, since: a.since })
  eq('and accumulates', b.battles[0].laps, 5)

  // Broken up, then reformed: it must not claim to have run the whole time.
  const apart = findBattles({ timing: [car(1, 1, 'NOR', ''), car(2, 16, 'LEC', '+2.0')],
    currentLap: 20, since: b.since })
  eq('a finished battle is forgotten', Object.keys(apart.since).length, 0)
  const again = findBattles({ timing: t, currentLap: 30, since: apart.since })
  eq('and a reformed one starts over', again.battles[0].laps, 1)
}

// ── MOM ────────────────────────────────────────────────────────────────────
group('overtake mode — the chaser\'s, and null when unknown')
{
  const t = [car(1, 1, 'NOR', ''), car(2, 16, 'LEC', '+0.4')]
  const r = findBattles({ timing: t, momByDriver: { 16: 'available', 1: 'on' } })
  eq('the chaser\'s mode is the one that matters', r.battles[0].chaser.mom, 'available')
}
{
  const t = [car(1, 1, 'NOR', ''), car(2, 16, 'LEC', '+0.4')]
  // No telemetry (a replay, or before the first packet). Not "off" — that
  // would state something we do not know.
  eq('unknown is null, not off', findBattles({ timing: t }).battles[0].chaser.mom, null)
}

// ── ordering ───────────────────────────────────────────────────────────────
group('ordering')
{
  const timing = [
    car(1, 1, 'NOR', ''),
    car(2, 16, 'LEC', '+0.3'),      // close, static
    car(3, 44, 'HAM', '+5.0'),      // not a battle
    car(4, 63, 'RUS', '+0.9'),      // further, closing fast
  ]
  const gapHistory = [
    { lap: 18, gap_1: 0, gap_16: 0.3, gap_44: 5.3, gap_63: 7.1 },
    { lap: 19, gap_1: 0, gap_16: 0.3, gap_44: 5.3, gap_63: 6.5 },
    { lap: 20, gap_1: 0, gap_16: 0.3, gap_44: 5.3, gap_63: 5.9 },
  ]
  const { battles } = findBattles({ timing, gapHistory, currentLap: 20 })
  eq('two battles found', battles.length, 2)
  eq('the closing one is first', battles[0].chaser.code, 'RUS')
  eq('and it is labelled closing', battles[0].trendLabel, 'closing')
  eq('the static one is second', battles[1].chaser.code, 'LEC')
  eq('and labelled stable', battles[1].trendLabel, 'stable')
  ok('the 5-second gap is not in the list', !battles.some((b) => b.chaser.code === 'HAM'))
}

// ── against the real race ──────────────────────────────────────────────────
const REPLAY = new URL('../../../backend/replay/2026-13-italian/race/stream.json.gz', import.meta.url)
if (existsSync(REPLAY)) {
  group('the 2026 Italian GP, folded from the committed replay')

  const stream = JSON.parse(gunzipSync(readFileSync(REPLAY)).toString('utf-8'))

  /** The tower state at a point in the race, folded the way the engine folds it. */
  function at(t) {
    const timing = new Map()
    const tyres = new Map()
    let trackStatus = { status: '1' }
    const raceControl = []
    let lap = null
    for (const ev of stream.events) {
      if (ev.t > t) break
      if (ev.type === 'timing') {
        for (const d of ev.data.drivers) {
          timing.set(d.number, { ...(timing.get(d.number) ?? {}), ...d })
        }
      } else if (ev.type === 'tyres') {
        for (const d of ev.data.drivers) {
          tyres.set(d.number, { ...(tyres.get(d.number) ?? {}), ...d })
        }
      } else if (ev.type === 'track_status') trackStatus = ev.data
      else if (ev.type === 'race_control') raceControl.unshift(...ev.data.messages)
      else if (ev.type === 'lap_count') lap = ev.data.current
    }
    return {
      timing: [...timing.values()], tyres: [...tyres.values()],
      trackStatus, raceControl, currentLap: lap,
    }
  }

  const marker = (kind) => stream.markers.find((m) => m.kind === kind)

  {
    const sc = marker('sc')
    const state = at(sc.t + 5)
    const r = findBattles(state)
    eq('safety car: real track status is 4', state.trackStatus.status, '4')
    eq('safety car: panel suppressed', r.suppressed, '4')
    eq('safety car: no battles listed', r.battles.length, 0)
  }
  {
    const red = marker('red')
    const r = findBattles(at(red.t + 5))
    eq('red flag: panel suppressed', r.suppressed, '5')
  }
  {
    const vsc = marker('vsc')
    const r = findBattles(at(vsc.t + 5))
    eq('VSC: panel suppressed', r.suppressed, '6')
  }
  {
    // Lap 6, just after the standing restart from the red flag — the whole
    // field is nose to tail, which is the busiest the radar ever gets.
    const state = at(2700)
    const r = findBattles(state)
    ok('restart: not suppressed', r.suppressed === null)
    ok('restart: the field is full of fights', r.battles.length > 10, `${r.battles.length} found`)
    ok('every interval is under the threshold',
      r.battles.every((b) => b.interval > 0 && b.interval < BATTLE_THRESHOLD_S))
    ok('every pair is adjacent on the road',
      r.battles.every((b) => b.chaser.position === b.ahead.position + 1))
    ok('no car appears as its own rival',
      r.battles.every((b) => b.chaser.number !== b.ahead.number))
    ok('scores are in descending order',
      r.battles.every((b, i) => i === 0 || r.battles[i - 1].score >= b.score))
  }
  {
    // Deep into the race the leaders had strung out: at this point the closest
    // pair on track was 1.028s apart, so the honest answer is an empty panel.
    // A radar that always finds something is not reading the race.
    const r = findBattles(at(5400))
    ok('no fights means no rows', r.battles.length === 0, `${r.battles.length} found`)
    ok('and it is not because it was suppressed', r.suppressed === null)
  }
  {
    // LEC retired on lap 2 at Monza; he must not appear in the radar after it.
    const r = findBattles(at(4000))
    ok('the retired car is absent',
      !r.battles.some((b) => b.chaser.code === 'LEC' || b.ahead.code === 'LEC'))
  }
  {
    // Cars many laps down must never be paired with the leaders.
    const state = at(6500)
    const byNum = new Map(state.timing.map((d) => [d.number, d]))
    const { battles } = findBattles(state)
    for (const b of battles) {
      const la = Number(byNum.get(b.ahead.number)?.lap)
      const lc = Number(byNum.get(b.chaser.number)?.lap)
      ok(`${b.ahead.code} v ${b.chaser.code} are on the same lap`,
        !Number.isFinite(la) || !Number.isFinite(lc) || Math.abs(la - lc) <= 1,
        `${la} vs ${lc}`)
    }
  }
} else {
  group('replay data not built — skipping the real-race checks')
}

console.log(fails.length ? `\n${fails.length} FAILED of ${pass + fails.length}` : `\nall ${pass} assertions passed`)
if (fails.length) process.exit(1)
