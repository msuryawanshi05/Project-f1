/**
 * Run: node src/utils/weekendState.test.mjs   (from pitwall/frontend)
 *
 * Drives the weekend state machine through two REAL 2026 weekends, minute by
 * minute at each boundary, with an injected clock:
 *
 *   Belgian GP (Spa, Europe/Brussels)   — normal weekend, UTC+2 in July
 *   Chinese GP (Shanghai, Asia/Shanghai) — sprint weekend, UTC+8
 *
 * Shanghai is the one that matters for the timezone requirement: Thursday
 * 00:00 local is Wednesday 16:00 UTC, so a machine that evaluates the rollover
 * in the viewer's timezone puts a European viewer on the wrong GP for most of
 * a day. Schedules are the real Jolpica times.
 */
import assert from 'node:assert/strict'
import {
  WeekendState, TowerContent, GAP_IDLE_LEAD_MS,
  resolveWeekendState, weekendWindow, allowedTabs, towerContentFor,
  disabledTabMessage,
} from './sessionLifecycle.js'
import { buildSessions, gridConsumerFor } from './sessionSchedule.js'

let passed = 0
function check(label, got, want) {
  assert.deepEqual(got, want, `${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`)
  console.log(`  ok   ${label}`)
  passed++
}

const at = (iso) => Date.parse(iso)

// ── Real 2026 schedules (Jolpica) ──────────────────────────────────────────
const SPA = buildSessions({
  raceName: 'Belgian Grand Prix',
  FirstPractice:  { date: '2026-07-17', time: '11:30:00Z' },
  SecondPractice: { date: '2026-07-17', time: '15:00:00Z' },
  ThirdPractice:  { date: '2026-07-18', time: '10:30:00Z' },
  Qualifying:     { date: '2026-07-18', time: '14:00:00Z' },
  date: '2026-07-19', time: '13:00:00Z',
})
const SPA_TZ = 'Europe/Brussels'

const SHANGHAI = buildSessions({
  raceName: 'Chinese Grand Prix',
  FirstPractice:    { date: '2026-03-13', time: '03:30:00Z' },
  SprintQualifying: { date: '2026-03-13', time: '07:30:00Z' },
  Sprint:           { date: '2026-03-14', time: '03:00:00Z' },
  Qualifying:       { date: '2026-03-14', time: '07:00:00Z' },
  date: '2026-03-15', time: '07:00:00Z',
})
const SHA_TZ = 'Asia/Shanghai'

const spa = (iso, extra = {}) =>
  resolveWeekendState({ now: at(iso), sessions: SPA, timeZone: SPA_TZ, ...extra })
const sha = (iso, extra = {}) =>
  resolveWeekendState({ now: at(iso), sessions: SHANGHAI, timeZone: SHA_TZ, ...extra })

console.log('--- schedule parsing ---')
check('Spa has 5 sessions', SPA.length, 5)
check('Spa order', SPA.map((s) => s.key),
  ['FirstPractice', 'SecondPractice', 'ThirdPractice', 'Qualifying', 'Race'])
check('Shanghai is a sprint weekend', SHANGHAI.map((s) => s.key),
  ['FirstPractice', 'SprintQualifying', 'Sprint', 'Qualifying', 'Race'])
check('sprint quali is a qualifying type',
  SHANGHAI.find((s) => s.key === 'SprintQualifying').type, 'qualifying')
check('sprint is a race type', SHANGHAI.find((s) => s.key === 'Sprint').type, 'race')

console.log('--- weekend window is anchored in the CIRCUIT timezone ---')
// Spa: FP1 is Friday 17 Jul. Thursday 16 Jul 00:00 CEST = 15 Jul 22:00 UTC.
check('Spa window opens Wed 22:00 UTC (= Thu 00:00 local)',
  new Date(weekendWindow(SPA, SPA_TZ).start).toISOString(), '2026-07-15T22:00:00.000Z')
// Shanghai: FP1 is Friday 13 Mar. Thursday 12 Mar 00:00 CST = 11 Mar 16:00 UTC.
check('Shanghai window opens Wed 16:00 UTC (= Thu 00:00 local)',
  new Date(weekendWindow(SHANGHAI, SHA_TZ).start).toISOString(), '2026-03-11T16:00:00.000Z')
check('Shanghai window closes Wed 23:59:59.999 local',
  new Date(weekendWindow(SHANGHAI, SHA_TZ).end).toISOString(), '2026-03-18T15:59:59.999Z')
check('window is exactly 7 days',
  weekendWindow(SPA, SPA_TZ).end - weekendWindow(SPA, SPA_TZ).start + 1, 7 * 86400000)

console.log('--- Thursday rollover is the only thing that moves Live on ---')
check('one minute before the window: OUTSIDE',
  spa('2026-07-15T21:59:00Z').state, WeekendState.OUTSIDE)
check('at the window open: PRE_WEEKEND',
  spa('2026-07-15T22:00:00Z').state, WeekendState.PRE_WEEKEND)
check('Wednesday 23:59 local, still this GP',
  spa('2026-07-22T21:59:00Z').state, WeekendState.POST_WEEKEND)
check('one minute later, OUTSIDE',
  spa('2026-07-22T22:01:00Z').state, WeekendState.OUTSIDE)

console.log('--- normal weekend: Spa, every transition ---')
check('Thu all day', spa('2026-07-16T12:00:00Z').state, WeekendState.PRE_WEEKEND)
check('Fri T-31 before FP1 is still PRE_WEEKEND',
  spa('2026-07-17T10:59:00Z').state, WeekendState.PRE_WEEKEND)
check('FP1 running', spa('2026-07-17T12:00:00Z').state, WeekendState.SESSION_LIVE)
check('FP1 running is FP1', spa('2026-07-17T12:00:00Z').currentSession.key, 'FirstPractice')
check('FP1 done', spa('2026-07-17T13:00:00Z').state, WeekendState.SESSION_RESULTS)
check('FP1 results shows FP1', spa('2026-07-17T13:00:00Z').currentSession.key, 'FirstPractice')
check('FP2 T-31: still FP1 results', spa('2026-07-17T14:29:00Z').state, WeekendState.SESSION_RESULTS)
check('FP2 T-30: GAP_IDLE', spa('2026-07-17T14:30:00Z').state, WeekendState.GAP_IDLE)
check('GAP_IDLE names the next session', spa('2026-07-17T14:30:00Z').nextSession.key, 'SecondPractice')
check('FP2 running', spa('2026-07-17T15:30:00Z').state, WeekendState.SESSION_LIVE)
check('FP3 running', spa('2026-07-18T11:00:00Z').currentSession.key, 'ThirdPractice')
check('Quali running', spa('2026-07-18T14:30:00Z').currentSession.key, 'Qualifying')
check('Quali done -> results', spa('2026-07-18T15:30:00Z').state, WeekendState.SESSION_RESULTS)
check('Sunday morning, still quali results', spa('2026-07-19T09:00:00Z').state, WeekendState.SESSION_RESULTS)
check('Race T-30: GAP_IDLE', spa('2026-07-19T12:30:00Z').state, WeekendState.GAP_IDLE)
check('Race running', spa('2026-07-19T14:00:00Z').state, WeekendState.SESSION_LIVE)
check('after the flag: POST_WEEKEND', spa('2026-07-19T15:30:00Z').state, WeekendState.POST_WEEKEND)
check('Tuesday: still POST_WEEKEND', spa('2026-07-21T10:00:00Z').state, WeekendState.POST_WEEKEND)

console.log('--- sprint weekend: Shanghai ---')
check('Thu local (Wed 18:00 UTC)', sha('2026-03-11T18:00:00Z').state, WeekendState.PRE_WEEKEND)
check('FP1 running', sha('2026-03-13T04:00:00Z').currentSession.key, 'FirstPractice')
check('FP1 done', sha('2026-03-13T05:00:00Z').state, WeekendState.SESSION_RESULTS)
check('Sprint quali T-30', sha('2026-03-13T07:00:00Z').state, WeekendState.GAP_IDLE)
check('Sprint quali running', sha('2026-03-13T08:00:00Z').currentSession.key, 'SprintQualifying')
check('Sprint quali done', sha('2026-03-13T09:00:00Z').state, WeekendState.SESSION_RESULTS)
check('Sprint running', sha('2026-03-14T03:15:00Z').currentSession.key, 'Sprint')
check('Sprint done -> results', sha('2026-03-14T04:00:00Z').state, WeekendState.SESSION_RESULTS)
check('Quali T-30', sha('2026-03-14T06:30:00Z').state, WeekendState.GAP_IDLE)
check('Quali running', sha('2026-03-14T07:30:00Z').currentSession.key, 'Qualifying')
check('Race running', sha('2026-03-15T08:00:00Z').currentSession.key, 'Race')
check('after the flag', sha('2026-03-15T09:30:00Z').state, WeekendState.POST_WEEKEND)

console.log('--- sub-tab gating: normal weekend ---')
const tabsAt = (sessions, tz, iso) => {
  const w = resolveWeekendState({ now: at(iso), sessions, timeZone: tz })
  const t = allowedTabs({ ...w, sessions, now: at(iso) })
  return [t.TOWER, t.STRATEGY, t.TELEMETRY, t.RADIO]
}
check('FP1 live: all four', tabsAt(SPA, SPA_TZ, '2026-07-17T12:00:00Z'), [true, true, true, true])
check('FP1 results: all four', tabsAt(SPA, SPA_TZ, '2026-07-17T13:00:00Z'), [true, true, true, true])
check('Quali live: all four', tabsAt(SPA, SPA_TZ, '2026-07-18T14:30:00Z'), [true, true, true, true])
check('Quali done -> tower only', tabsAt(SPA, SPA_TZ, '2026-07-18T15:30:00Z'), [true, false, false, false])
check('Sunday pre-race -> tower only', tabsAt(SPA, SPA_TZ, '2026-07-19T09:00:00Z'), [true, false, false, false])
check('Race T-30 -> still tower only', tabsAt(SPA, SPA_TZ, '2026-07-19T12:30:00Z'), [true, false, false, false])
check('Race live: all four', tabsAt(SPA, SPA_TZ, '2026-07-19T14:00:00Z'), [true, true, true, true])
check('post-race: all four', tabsAt(SPA, SPA_TZ, '2026-07-20T10:00:00Z'), [true, true, true, true])

console.log('--- sub-tab gating: sprint weekend (same rule, no special case) ---')
check('FP1 live', tabsAt(SHANGHAI, SHA_TZ, '2026-03-13T04:00:00Z'), [true, true, true, true])
check('sprint quali live', tabsAt(SHANGHAI, SHA_TZ, '2026-03-13T08:00:00Z'), [true, true, true, true])
check('sprint quali done -> tower only', tabsAt(SHANGHAI, SHA_TZ, '2026-03-13T09:00:00Z'), [true, false, false, false])
check('sprint live: all four', tabsAt(SHANGHAI, SHA_TZ, '2026-03-14T03:15:00Z'), [true, true, true, true])
check('sprint results: all four', tabsAt(SHANGHAI, SHA_TZ, '2026-03-14T04:00:00Z'), [true, true, true, true])
check('quali live: all four', tabsAt(SHANGHAI, SHA_TZ, '2026-03-14T07:30:00Z'), [true, true, true, true])
check('quali done -> tower only', tabsAt(SHANGHAI, SHA_TZ, '2026-03-14T08:30:00Z'), [true, false, false, false])
check('race live: all four', tabsAt(SHANGHAI, SHA_TZ, '2026-03-15T08:00:00Z'), [true, true, true, true])

console.log('--- the grid-consumer rule is derived, not hardcoded ---')
check('sprint quali sets the sprint grid',
  gridConsumerFor(SHANGHAI, SHANGHAI.find((s) => s.key === 'SprintQualifying')).key, 'Sprint')
check('quali sets the race grid',
  gridConsumerFor(SHANGHAI, SHANGHAI.find((s) => s.key === 'Qualifying')).key, 'Race')
check('a practice session sets no grid',
  gridConsumerFor(SPA, SPA.find((s) => s.key === 'FirstPractice')), null)

console.log('--- tower content by phase ---')
const towerAt = (sessions, tz, iso) => {
  const w = resolveWeekendState({ now: at(iso), sessions, timeZone: tz })
  return towerContentFor({ ...w, sessions, now: at(iso) })
}
check('pre-weekend: schedule', towerAt(SPA, SPA_TZ, '2026-07-16T12:00:00Z'), TowerContent.SCHEDULE)
check('practice live', towerAt(SPA, SPA_TZ, '2026-07-17T12:00:00Z'), TowerContent.PRACTICE)
check('quali live', towerAt(SPA, SPA_TZ, '2026-07-18T14:30:00Z'), TowerContent.QUALIFYING)
check('post-quali: STARTING GRID, not the quali classification',
  towerAt(SPA, SPA_TZ, '2026-07-19T09:00:00Z'), TowerContent.STARTING_GRID)
check('race live', towerAt(SPA, SPA_TZ, '2026-07-19T14:00:00Z'), TowerContent.RACE)
check('post-race: classification', towerAt(SPA, SPA_TZ, '2026-07-20T10:00:00Z'), TowerContent.CLASSIFICATION)
check('post sprint-quali: starting grid (for the sprint)',
  towerAt(SHANGHAI, SHA_TZ, '2026-03-13T09:00:00Z'), TowerContent.STARTING_GRID)
check('post-sprint: classification',
  towerAt(SHANGHAI, SHA_TZ, '2026-03-14T04:00:00Z'), TowerContent.CLASSIFICATION)

console.log('--- a real finish signal beats the nominal fallback ---')
// Quali scheduled 14:00-15:00. A red flag pushes the real end to 15:40.
check('nominal alone would call it finished at 15:30',
  spa('2026-07-18T15:30:00Z').state, WeekendState.SESSION_RESULTS)
check('a later real end keeps it live',
  spa('2026-07-18T15:30:00Z', { actualEnds: { Qualifying: at('2026-07-18T15:40:00Z') } }).state,
  WeekendState.SESSION_LIVE)
check('an EARLIER real end finishes it early',
  spa('2026-07-18T14:50:00Z', { actualEnds: { Qualifying: at('2026-07-18T14:45:00Z') } }).state,
  WeekendState.SESSION_RESULTS)
check('the feed reporting a session live outranks the clock entirely',
  spa('2026-07-18T16:30:00Z', { liveSessionKey: 'Qualifying' }).state,
  WeekendState.SESSION_LIVE)
check('a stale liveSessionKey for an unknown session is ignored',
  spa('2026-07-18T15:30:00Z', { liveSessionKey: 'NotASession' }).state,
  WeekendState.SESSION_RESULTS)

console.log('--- GAP_IDLE boundary is exact ---')
const fp2Start = SPA.find((s) => s.key === 'SecondPractice').start
check('one ms before T-30: results',
  spa(new Date(fp2Start - GAP_IDLE_LEAD_MS - 1).toISOString()).state, WeekendState.SESSION_RESULTS)
check('exactly T-30: idle',
  spa(new Date(fp2Start - GAP_IDLE_LEAD_MS).toISOString()).state, WeekendState.GAP_IDLE)
check('one ms before the start: idle',
  spa(new Date(fp2Start - 1).toISOString()).state, WeekendState.GAP_IDLE)
check('at the start: live',
  spa(new Date(fp2Start).toISOString()).state, WeekendState.SESSION_LIVE)

console.log('--- degenerate input ---')
check('no sessions: OUTSIDE', resolveWeekendState({ now: at('2026-07-17T12:00:00Z') }).state, WeekendState.OUTSIDE)
check('no window for an empty schedule', weekendWindow([], 'UTC'), null)
check('unknown timezone behaves as UTC, does not throw',
  typeof weekendWindow(SPA, 'Not/AZone').start, 'number')
// Session labels are codes. They are quoted as the schedule spells them —
// lowercasing turned FP1 into "fp1", which reads as a typo.
check('disabled message names the next session',
  disabledTabMessage('awaiting_grid', { nextSession: { label: 'RACE' } }),
  'No data between qualifying and RACE. It returns when RACE starts.')
check('disabled message keeps a session code intact',
  disabledTabMessage('pre_weekend', { nextSession: { label: 'FP1' } }),
  'Nothing has run yet this weekend. Data appears once FP1 starts.')
check('disabled message without a next session still reads',
  disabledTabMessage('awaiting_grid', {}),
  'No data between qualifying and the next session. It returns when the next session starts.')

console.log(`\nall ${passed} assertions passed`)
