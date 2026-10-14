/**
 * startingGrid.test.mjs — node src/utils/startingGrid.test.mjs
 *
 * Grid penalties are the one piece of this phase that can be visibly, provably
 * wrong: if the maths is off by one, the tower tells the viewer the wrong
 * driver is on pole. The cases below are the real shapes of FIA race control
 * messages, including the ones that must NOT be read as grid penalties.
 */

import {
  parseGridPenalties, applyGridPenalties, buildStartingGrid, gridSourceNote,
} from './startingGrid.js'

let pass = 0
const fails = []
function ok(label, cond) {
  if (cond) { pass++; console.log(`  ok   ${label}`) }
  else { fails.push(label); console.log(`  FAIL ${label}`) }
}
function eq(label, actual, expected) {
  ok(`${label} (got ${JSON.stringify(actual)})`, actual === expected)
}
function group(name) { console.log(`\n${name}`) }

// A plausible top-10 qualifying classification.
const QUALI = [
  { position: 1,  number: '1',  code: 'VER' },
  { position: 2,  number: '4',  code: 'NOR' },
  { position: 3,  number: '16', code: 'LEC' },
  { position: 4,  number: '63', code: 'RUS' },
  { position: 5,  number: '81', code: 'PIA' },
  { position: 6,  number: '44', code: 'HAM' },
  { position: 7,  number: '14', code: 'ALO' },
  { position: 8,  number: '55', code: 'SAI' },
  { position: 9,  number: '12', code: 'ANT' },
  { position: 10, number: '87', code: 'BEA' },
]

const rc = (message, extra = {}) => ({ message, ...extra })

// ── parsing ────────────────────────────────────────────────────────────────
group('parseGridPenalties — recognises real penalty wording')
{
  const p = parseGridPenalties([
    rc('CAR 16 (LEC) - 10 PLACE GRID PENALTY FOR EXCEEDING POWER UNIT ELEMENTS'),
  ])
  eq('place penalty parsed', p['16']?.places, 10)
  eq('kind is PLACES', p['16']?.kind, 'PLACES')
}
{
  const p = parseGridPenalties([rc('CAR 44 (HAM) - 5 GRID POSITION PENALTY FOR IMPEDING')])
  eq('"GRID POSITION PENALTY" wording', p['44']?.places, 5)
}
{
  const p = parseGridPenalties([rc('CAR 63 (RUS) - 3 GRID PLACE PENALTY')])
  eq('"GRID PLACE PENALTY" wording', p['63']?.places, 3)
}
{
  const p = parseGridPenalties([rc('CAR 1 (VER) WILL START FROM THE PIT LANE')])
  eq('pit lane start', p['1']?.kind, 'PIT_LANE')
  ok('pit lane is unbounded', !Number.isFinite(p['1']?.places))
}
{
  const p = parseGridPenalties([rc('CAR 81 (PIA) WILL START FROM THE BACK OF THE GRID')])
  eq('back of grid', p['81']?.kind, 'BACK_OF_GRID')
}
{
  const p = parseGridPenalties([rc('CAR 55 (SAI) DISQUALIFIED FROM QUALIFYING - CAR UNDERWEIGHT')])
  eq('quali DSQ sends to the back', p['55']?.kind, 'BACK_OF_GRID')
}
{
  // driver_number on the message is used when the text does not say "CAR n"
  const p = parseGridPenalties([rc('5 PLACE GRID PENALTY - GEARBOX CHANGE', { driver_number: 14 })])
  eq('driver_number field used', p['14']?.places, 5)
}

group('parseGridPenalties — ignores what is not a grid penalty')
{
  const p = parseGridPenalties([
    rc('CAR 4 (NOR) 5 SECOND TIME PENALTY FOR LEAVING THE TRACK'),
    rc('CAR 16 (LEC) TRACK LIMITS - LAP 12 DELETED'),
    rc('CAR 63 (RUS) UNDER INVESTIGATION - IMPEDING'),
    rc('CAR 81 (PIA) - NO FURTHER ACTION'),
    rc('YELLOW FLAG IN SECTOR 2'),
    rc('DRS ENABLED'),
  ])
  eq('nothing parsed from non-grid messages', Object.keys(p).length, 0)
}
{
  // The dangerous near-miss: a time penalty must never become a grid drop.
  const p = parseGridPenalties([rc('CAR 1 (VER) 10 SECOND TIME PENALTY')])
  ok('10s time penalty is not a 10-place drop', p['1'] === undefined)
}
{
  const p = parseGridPenalties([
    rc('CAR 44 (HAM) - 3 PLACE GRID PENALTY FOR CAUSING A COLLISION'),
    rc('CAR 44 (HAM) - 3 PLACE GRID PENALTY FOR CAUSING A COLLISION'),
  ])
  eq('identical message not double counted', p['44']?.places, 3)
}
{
  const p = parseGridPenalties([
    rc('CAR 44 (HAM) - 3 PLACE GRID PENALTY FOR CAUSING A COLLISION'),
    rc('CAR 44 (HAM) - 5 PLACE GRID PENALTY FOR EXCEEDING ENGINE ELEMENTS'),
  ])
  eq('two different penalties accumulate', p['44']?.places, 8)
}
{
  const p = parseGridPenalties([
    rc('CAR 1 (VER) - 5 PLACE GRID PENALTY'),
    rc('CAR 1 (VER) WILL START FROM THE PIT LANE'),
  ])
  eq('pit lane subsumes a place drop', p['1']?.kind, 'PIT_LANE')
}

// ── applying ───────────────────────────────────────────────────────────────
group('applyGridPenalties — one 10-place drop from P3')
{
  const rows = applyGridPenalties(QUALI, {
    16: { places: 10, kind: 'PLACES', reason: 'PU elements', order: 0 },
  })
  const codes = rows.map((r) => r.code)
  // LEC was P3 of 10. Dropping 10 from index 2 clamps to the back.
  eq('LEC is last', codes[codes.length - 1], 'LEC')
  eq('NOR inherits P2', codes[1], 'NOR')
  eq('LEC grid position', rows[rows.length - 1].gridPosition, 10)
  eq('LEC delta is -7', rows[rows.length - 1].delta, -7)
  eq('LEC quali position preserved', rows[rows.length - 1].qualiPosition, 3)
  eq('drivers behind gain one place', rows.find((r) => r.code === 'RUS').delta, 1)
  eq('pole unaffected', rows[0].code, 'VER')
  eq('pole delta zero', rows[0].delta, 0)
}

group('applyGridPenalties — a 3-place drop moves exactly three')
{
  const rows = applyGridPenalties(QUALI, {
    4: { places: 3, kind: 'PLACES', reason: 'collision', order: 0 },
  })
  const codes = rows.map((r) => r.code)
  // NOR P2 → index 1, drops to index 4 → P5.
  eq('NOR ends P5', rows.find((r) => r.code === 'NOR').gridPosition, 5)
  eq('NOR delta -3', rows.find((r) => r.code === 'NOR').delta, -3)
  eq('LEC promoted to P2', codes[1], 'LEC')
  eq('RUS promoted to P3', codes[2], 'RUS')
  eq('PIA promoted to P4', codes[3], 'PIA')
  eq('HAM unchanged at P6', rows.find((r) => r.code === 'HAM').gridPosition, 6)
  eq('field size preserved', rows.length, 10)
}

group('applyGridPenalties — pit lane start has no grid slot')
{
  const rows = applyGridPenalties(QUALI, {
    1: { places: Infinity, kind: 'PIT_LANE', reason: 'parc ferme', order: 0 },
  })
  eq('VER is last in the list', rows[rows.length - 1].code, 'VER')
  eq('VER has no grid position', rows[rows.length - 1].gridPosition, null)
  eq('VER delta is null, not a number', rows[rows.length - 1].delta, null)
  eq('NOR takes pole', rows[0].code, 'NOR')
  eq('NOR grid position 1', rows[0].gridPosition, 1)
  eq('last numbered slot is 9', rows[8].gridPosition, 9)
}

group('applyGridPenalties — pit lane lines up behind back-of-grid')
{
  const rows = applyGridPenalties(QUALI, {
    1:  { places: Infinity, kind: 'PIT_LANE', reason: 'x', order: 0 },
    81: { places: Infinity, kind: 'BACK_OF_GRID', reason: 'y', order: 1 },
  })
  eq('back-of-grid ahead of pit lane', rows[rows.length - 2].code, 'PIA')
  eq('pit lane truly last', rows[rows.length - 1].code, 'VER')
  // With one car in the pit lane the grid has nine slots, not ten.
  eq('PIA gets the last numbered slot', rows[rows.length - 2].gridPosition, 9)
}

group('applyGridPenalties — order of imposition matters')
{
  // Two drivers from adjacent rows each drop 2. Applying LEC first then RUS
  // gives a different grid from the reverse, which is why `order` is kept.
  const first = applyGridPenalties(QUALI, {
    16: { places: 2, kind: 'PLACES', reason: 'a', order: 0 },
    63: { places: 2, kind: 'PLACES', reason: 'b', order: 1 },
  }).map((r) => r.code)
  const second = applyGridPenalties(QUALI, {
    16: { places: 2, kind: 'PLACES', reason: 'a', order: 1 },
    63: { places: 2, kind: 'PLACES', reason: 'b', order: 0 },
  }).map((r) => r.code)
  ok('order changes the result', first.join() !== second.join())
  eq('both runs keep 10 cars', first.length, 10)
}

group('applyGridPenalties — penalty on a driver not in the classification')
{
  const rows = applyGridPenalties(QUALI, {
    99: { places: 5, kind: 'PLACES', reason: 'ghost', order: 0 },
  })
  eq('unknown car ignored', rows.length, 10)
  eq('order untouched', rows[0].code, 'VER')
}

// ── buildStartingGrid ──────────────────────────────────────────────────────
group('buildStartingGrid — confidence levels')
{
  const g = buildStartingGrid({ qualifying: QUALI, raceControl: [] })
  eq('no penalty info → provisional', g.source, 'provisional')
  eq('labelled PROVISIONAL GRID', g.label, 'PROVISIONAL GRID')
  eq('penalty count zero', g.penaltyCount, 0)
  eq('rows are quali order', g.rows[0].code, 'VER')
  eq('every delta zero', g.rows.every((r) => r.delta === 0), true)
}
{
  const g = buildStartingGrid({
    qualifying: QUALI,
    raceControl: [rc('CAR 16 (LEC) - 10 PLACE GRID PENALTY FOR POWER UNIT ELEMENTS')],
  })
  eq('penalties found → adjusted', g.source, 'adjusted')
  eq('labelled STARTING GRID', g.label, 'STARTING GRID')
  eq('one penalty counted', g.penaltyCount, 1)
  eq('LEC dropped', g.rows[g.rows.length - 1].code, 'LEC')
}
{
  const g = buildStartingGrid({
    qualifying: QUALI,
    raceControl: [rc('CAR 16 (LEC) - 10 PLACE GRID PENALTY')],
    officialGrid: [
      { number: '4', grid: 1 }, { number: '1', grid: 2 }, { number: '63', grid: 3 },
      { number: '81', grid: 4 }, { number: '44', grid: 5 }, { number: '14', grid: 6 },
      { number: '55', grid: 7 }, { number: '12', grid: 8 }, { number: '87', grid: 9 },
      { number: '16', grid: 10 },
    ],
  })
  eq('official grid wins over parsed penalties', g.source, 'official')
  eq('official order respected', g.rows[0].code, 'NOR')
  eq('VER second on the official grid', g.rows[1].code, 'VER')
  eq('VER delta -1', g.rows[1].delta, -1)
  eq('NOR delta +1', g.rows[0].delta, 1)
  eq('LEC last', g.rows[9].code, 'LEC')
}
{
  const g = buildStartingGrid({
    qualifying: QUALI,
    officialGrid: [{ number: '1', grid: 0 }],
  })
  // grid 0 means pit lane; with no other usable positions we must not claim an
  // official grid built from a single zero.
  eq('all-zero official grid falls back', g.source, 'provisional')
}
{
  const g = buildStartingGrid({ qualifying: [], raceControl: [] })
  eq('no qualifying → empty rows', g.rows.length, 0)
  eq('no qualifying → provisional', g.source, 'provisional')
}

group('gridSourceNote')
{
  ok('official note mentions official', gridSourceNote('official').includes('official'))
  ok('adjusted note counts one penalty',
    gridSourceNote('adjusted', 1).includes('1 grid penalty'))
  ok('adjusted note pluralises',
    gridSourceNote('adjusted', 3).includes('3 grid penalties'))
  ok('provisional note warns positions may change',
    gridSourceNote('provisional').toLowerCase().includes('may still change'))
}

console.log(fails.length ? `\n${fails.length} FAILED of ${pass + fails.length}` : `\nall ${pass} assertions passed`)
if (fails.length) process.exit(1)
