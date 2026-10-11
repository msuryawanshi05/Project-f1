/**
 * Run: node src/utils/sessionLifecycle.test.mjs   (from pitwall/frontend)
 *
 * The regression case is the Singapore GP on 2026-10-11: the race ended at
 * 14:00 UTC and at 14:54 the app still presented it as live, while Jolpica had
 * published nothing for round 17 (total=0). Both of those are asserted below
 * with the real timestamps.
 */
import assert from 'node:assert/strict'
import {
  resolveSessionState,
  sessionStateLabel,
  SessionState,
  PROVISIONAL_WINDOW_MS,
  OVERRUN_GRACE_MS,
} from './sessionLifecycle.js'

let passed = 0
function check(label, got, want) {
  assert.deepEqual(got, want, `${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`)
  console.log(`  ok   ${label}`)
  passed++
}

// Real Singapore GP 2026 race session (OpenF1 session_key 11388).
const START = '2026-10-11T12:00:00+00:00'
const END = '2026-10-11T14:00:00+00:00'
const at = (iso) => Date.parse(iso)

console.log('--- the Singapore regression ---')
check('54 min after the flag is NOT live',
  resolveSessionState({
    now: at('2026-10-11T14:54:00Z'), sessionStart: START, sessionEnd: END,
    liveFeedActive: false, feedFinished: true, hasTimingState: true,
    hasOfficialResults: false,
  }).isLive,
  false)
check('54 min after the flag, with no official results, is RESULTS_PENDING',
  resolveSessionState({
    now: at('2026-10-11T14:54:00Z'), sessionStart: START, sessionEnd: END,
    feedFinished: true, hasTimingState: true, hasOfficialResults: false,
  }).state,
  SessionState.RESULTS_PENDING)
check('stale lap/timing state alone never implies live',
  resolveSessionState({
    now: at('2026-10-11T18:00:00Z'), sessionStart: START, sessionEnd: END,
    hasTimingState: true, feedFinished: true,
  }).isLive,
  false)

console.log('--- during the session ---')
check('mid-race is RUNNING',
  resolveSessionState({ now: at('2026-10-11T13:00:00Z'), sessionStart: START, sessionEnd: END }).state,
  SessionState.RUNNING)
check('mid-race is live',
  resolveSessionState({ now: at('2026-10-11T13:00:00Z'), sessionStart: START, sessionEnd: END }).isLive,
  true)
check('before lights out is PRE',
  resolveSessionState({ now: at('2026-10-11T11:00:00Z'), sessionStart: START, sessionEnd: END }).state,
  SessionState.PRE)
check('PRE does not show the tower',
  resolveSessionState({ now: at('2026-10-11T11:00:00Z'), sessionStart: START, sessionEnd: END }).showTower,
  false)

console.log('--- overrunning (red-flagged) session ---')
check('a streaming feed keeps it RUNNING well past date_end',
  resolveSessionState({
    now: at('2026-10-11T16:30:00Z'), sessionStart: START, sessionEnd: END,
    liveFeedActive: true, hasTimingState: true,
  }).state,
  SessionState.RUNNING)
check('within the overrun grace, no finish seen yet, still RUNNING',
  resolveSessionState({
    now: at(END) + OVERRUN_GRACE_MS - 1000, sessionStart: START, sessionEnd: END,
    feedFinished: false,
  }).state,
  SessionState.RUNNING)
check('chequered flag inside the grace window ends RUNNING immediately',
  resolveSessionState({
    now: at(END) - 60_000, sessionStart: START, sessionEnd: END,
    feedFinished: true, hasTimingState: true,
  }).state,
  SessionState.PROVISIONAL)

console.log('--- provisional window ---')
check('just after the flag is PROVISIONAL',
  resolveSessionState({
    now: at('2026-10-11T14:05:00Z'), sessionStart: START, sessionEnd: END,
    feedFinished: true, hasTimingState: true,
  }).state,
  SessionState.PROVISIONAL)
check('PROVISIONAL still shows the tower',
  resolveSessionState({
    now: at('2026-10-11T14:05:00Z'), sessionStart: START, sessionEnd: END,
    feedFinished: true, hasTimingState: true,
  }).showTower,
  true)
check('PROVISIONAL is flagged as provisional',
  resolveSessionState({
    now: at('2026-10-11T14:05:00Z'), sessionStart: START, sessionEnd: END,
    feedFinished: true, hasTimingState: true,
  }).provisional,
  true)
check('PROVISIONAL is never reported as live',
  resolveSessionState({
    now: at('2026-10-11T14:05:00Z'), sessionStart: START, sessionEnd: END,
    feedFinished: true, hasTimingState: true,
  }).isLive,
  false)
check('no retained timing -> cannot be provisional',
  resolveSessionState({
    now: at('2026-10-11T14:05:00Z'), sessionStart: START, sessionEnd: END,
    feedFinished: true, hasTimingState: false,
  }).state,
  SessionState.RESULTS_PENDING)
check('the edge of the provisional window is still provisional',
  resolveSessionState({
    now: at(END) + PROVISIONAL_WINDOW_MS, sessionStart: START, sessionEnd: END,
    feedFinished: true, hasTimingState: true,
  }).state,
  SessionState.PROVISIONAL)
check('one second past it is not',
  resolveSessionState({
    now: at(END) + PROVISIONAL_WINDOW_MS + 1000, sessionStart: START, sessionEnd: END,
    feedFinished: true, hasTimingState: true,
  }).state,
  SessionState.RESULTS_PENDING)

console.log('--- official results supersede ---')
check('published results give RESULTS_READY',
  resolveSessionState({
    now: at('2026-10-11T20:00:00Z'), sessionStart: START, sessionEnd: END,
    feedFinished: true, hasTimingState: true, hasOfficialResults: true,
  }).state,
  SessionState.RESULTS_READY)
check('results do NOT override a session still streaming',
  resolveSessionState({
    now: at('2026-10-11T13:00:00Z'), sessionStart: START, sessionEnd: END,
    liveFeedActive: true, hasOfficialResults: true,
  }).state,
  SessionState.RUNNING)
check('RESULTS_READY does not show the tower',
  resolveSessionState({
    now: at('2026-10-11T20:00:00Z'), sessionStart: START, sessionEnd: END,
    feedFinished: true, hasOfficialResults: true,
  }).showTower,
  false)

console.log('--- no session / missing schedule ---')
check('nothing known at all is IDLE',
  resolveSessionState({ now: at('2026-10-11T14:54:00Z') }).state,
  SessionState.IDLE)
check('chequered with no schedule but retained timing is PROVISIONAL',
  resolveSessionState({ now: at('2026-10-11T14:05:00Z'), feedFinished: true, hasTimingState: true }).state,
  SessionState.PROVISIONAL)
check('chequered with no schedule and no timing is RESULTS_PENDING',
  resolveSessionState({ now: at('2026-10-11T14:05:00Z'), feedFinished: true }).state,
  SessionState.RESULTS_PENDING)
check('unparseable dates do not crash',
  resolveSessionState({ now: 0, sessionStart: 'not-a-date', sessionEnd: 'nope' }).state,
  SessionState.IDLE)
check('msSinceEnd is null without an end time',
  resolveSessionState({ now: 0 }).msSinceEnd,
  null)

console.log('--- labels ---')
check('RUNNING label', sessionStateLabel(SessionState.RUNNING), 'LIVE TIMING')
check('PROVISIONAL label', sessionStateLabel(SessionState.PROVISIONAL), 'PROVISIONAL CLASSIFICATION')
check('RESULTS_PENDING label', sessionStateLabel(SessionState.RESULTS_PENDING), 'AWAITING OFFICIAL RESULTS')
check('unknown state label', sessionStateLabel('WAT'), 'NO SESSION')

console.log(`\nall ${passed} assertions passed`)
