/**
 * sessionLifecycle.js — the single source of truth for "what stage is this
 * session at", and therefore what the Live page should be showing.
 *
 * Why this exists
 * ---------------
 * There was no such concept. "Is it live?" was a sprawling boolean OR spread
 * across useRaceWeekendState, Live.jsx, StatusBar and RadioTab, and every copy
 * had the same defect: it treated *evidence that a session had happened* as
 * evidence it was still happening.
 *
 *   isLivePhase = ... || Boolean(session.lap && session.lap >= 1)
 *                     || (timing.length > 0 && session.phase !== 'PRE')
 *
 * After the chequered flag, `session.lap` is 62 and `timing` is still populated
 * from the retained cache, so both disjuncts stay true indefinitely. The
 * Singapore GP finished and the app went on presenting it as live. The backend
 * compounded it by reporting is_live for two hours past date_end.
 *
 * A finished session is a distinct state from a running one, and "finished but
 * the official results aren't published yet" is a third. Conflating them is what
 * produced both a stale live view and an empty results table.
 *
 * States
 * ------
 *   PRE               before lights out — countdown
 *   RUNNING           live timing
 *   PROVISIONAL       chequered flag to +PROVISIONAL_WINDOW: the retained timing
 *                     state IS the classification. Show it, labelled as
 *                     provisional, never as live.
 *   RESULTS_PENDING   session over, official results not published yet. Jolpica
 *                     lags by minutes to hours (Singapore round 17 returned
 *                     total=0 an hour after the flag). Say so explicitly rather
 *                     than rendering an empty or stale table.
 *   RESULTS_READY     official results available — defer to them
 *   IDLE              no session in this window
 */

import { buildSessions, gridConsumerFor, nominalDurationMs } from './sessionSchedule.js'


/** How long after the chequered flag the retained timing state is the best source. */
export const PROVISIONAL_WINDOW_MS = 30 * 60 * 1000

/**
 * How long "waiting for the official classification" stays a useful statement.
 *
 * Jolpica usually publishes within a few hours. But RESULTS_PENDING is only
 * left when something actually fetches that round's results, and if nothing on
 * the current page does, the state persists indefinitely — three days after
 * the Singapore GP the deployed site still treated it as the current race and
 * labelled it "NEXT RACE" on the home page.
 *
 * Past this window the session stops being the thing the app is waiting on and
 * normal weekend logic resumes. The Results page still reports a missing
 * classification where it genuinely fetches one.
 */
export const PENDING_MAX_MS = 12 * 60 * 60 * 1000

/**
 * Grace past the scheduled end before we stop believing a session is running.
 *
 * Deliberately small. Red-flagged sessions do overrun their scheduled end, but
 * the authoritative signal for that is the SignalR feed still streaming with a
 * live phase — which `liveFeedActive` carries. Using a large time window as a
 * proxy for "probably still going" is what kept a finished race on screen.
 */
export const OVERRUN_GRACE_MS = 15 * 60 * 1000

export const SessionState = {
  PRE: 'PRE',
  RUNNING: 'RUNNING',
  PROVISIONAL: 'PROVISIONAL',
  RESULTS_PENDING: 'RESULTS_PENDING',
  RESULTS_READY: 'RESULTS_READY',
  IDLE: 'IDLE',
}

function toMs(value) {
  if (value == null) return null
  const t = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(t) ? t : null
}

/**
 * @param {object}  input
 * @param {number}  input.now                epoch ms
 * @param {*}       input.sessionStart        ISO string or Date
 * @param {*}       input.sessionEnd          ISO string or Date
 * @param {boolean} input.liveFeedActive      SignalR reporting a running session
 *                                            right now (phase LIVE / formation
 *                                            lap). Overrides the clock, so an
 *                                            overrunning red-flagged session
 *                                            stays RUNNING.
 * @param {boolean} input.feedFinished        SignalR reported the session as
 *                                            finished (chequered flag seen).
 * @param {boolean} input.hasTimingState      retained timing rows available
 * @param {boolean} input.hasOfficialResults  official classification published
 * @returns {{state: string, isLive: boolean, showTower: boolean,
 *            provisional: boolean, msSinceEnd: number|null}}
 */
export function resolveSessionState({
  now = Date.now(),
  sessionStart = null,
  sessionEnd = null,
  liveFeedActive = false,
  feedFinished = false,
  hasTimingState = false,
  hasOfficialResults = false,
} = {}) {
  const start = toMs(sessionStart)
  const end = toMs(sessionEnd)
  const msSinceEnd = end != null ? now - end : null

  const build = (state) => ({
    state,
    // "Live" means timing is still changing. Nothing else counts.
    isLive: state === SessionState.RUNNING,
    // The tower is the right surface for a running session AND for the window
    // where retained timing is the classification.
    showTower: state === SessionState.RUNNING || state === SessionState.PROVISIONAL,
    provisional: state === SessionState.PROVISIONAL,
    msSinceEnd,
  })

  // The feed is authoritative while it is actually streaming a live session.
  // This is what lets a red-flagged session that overruns its scheduled end
  // stay RUNNING without needing a generous clock window.
  if (liveFeedActive) return build(SessionState.RUNNING)

  // Official results supersede everything else once they exist.
  if (hasOfficialResults && (end == null || now > end)) {
    return build(SessionState.RESULTS_READY)
  }

  if (start != null && now < start) return build(SessionState.PRE)

  if (start != null && end != null) {
    // Inside the scheduled window, or just past it, and the feed has not
    // declared the session finished.
    if (now <= end + OVERRUN_GRACE_MS && !feedFinished) {
      return build(SessionState.RUNNING)
    }
    if (msSinceEnd != null && msSinceEnd <= PROVISIONAL_WINDOW_MS && hasTimingState) {
      return build(SessionState.PROVISIONAL)
    }
    if (msSinceEnd != null && msSinceEnd > 0) {
      // Stop claiming to be mid-wait once the wait has stopped being plausible.
      return build(msSinceEnd <= PENDING_MAX_MS ? SessionState.RESULTS_PENDING : SessionState.IDLE)
    }
  }

  // Chequered flag with no schedule to go on: trust the feed.
  if (feedFinished && hasTimingState) return build(SessionState.PROVISIONAL)
  if (feedFinished) return build(SessionState.RESULTS_PENDING)

  return build(SessionState.IDLE)
}

/** Human label for the tower header. */
export function sessionStateLabel(state) {
  switch (state) {
    case SessionState.RUNNING:         return 'LIVE TIMING'
    case SessionState.PROVISIONAL:     return 'PROVISIONAL CLASSIFICATION'
    case SessionState.RESULTS_PENDING: return 'AWAITING OFFICIAL RESULTS'
    case SessionState.RESULTS_READY:   return 'FINAL CLASSIFICATION'
    case SessionState.PRE:             return 'NOT STARTED'
    default:                           return 'NO SESSION'
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WEEKEND LAYER
//
// resolveSessionState above describes ONE session: is it running, just
// finished, waiting on results. This layer sits above it and answers a
// different question — which session the Live tab is currently ABOUT, and
// therefore what may render.
//
// They compose rather than compete: the weekend layer decides the subject,
// resolveSessionState describes that subject's own state.
// ═══════════════════════════════════════════════════════════════════════════

export const WeekendState = {
  /** Thursday 00:00 local until FP1 starts. */
  PRE_WEEKEND: 'PRE_WEEKEND',
  /** A session is running. */
  SESSION_LIVE: 'SESSION_LIVE',
  /** A session finished; showing its results until T-30 of the next one. */
  SESSION_RESULTS: 'SESSION_RESULTS',
  /** T-30 before the next session until it starts. */
  GAP_IDLE: 'GAP_IDLE',
  /** Race finished, through Wednesday 23:59 local. */
  POST_WEEKEND: 'POST_WEEKEND',
  /** Not inside any weekend window. */
  OUTSIDE: 'OUTSIDE',
}

/** How long before a session starts the idle card switches to counting it down. */
export const GAP_IDLE_LEAD_MS = 30 * 60 * 1000

// ── Timezone ───────────────────────────────────────────────────────────────
// Boundaries are defined in the CIRCUIT's local time, so they must be computed
// there. "Thursday 00:00" in Shanghai is Wednesday 16:00 UTC; evaluating the
// rollover in the viewer's timezone would move it by their offset and put a
// European viewer on the wrong GP for the better part of a day.

/** Offset of `timeZone` from UTC at instant `date`, in ms. */
function zoneOffsetMs(date, timeZone) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]))
    // Date.UTC of the wall-clock reading in that zone, minus the real instant,
    // is the zone's offset at that instant.
    const asUtc = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour === '24' ? '0' : p.hour), Number(p.minute), Number(p.second),
    )
    return asUtc - date.getTime()
  } catch {
    return 0   // unknown zone — behave as UTC rather than throwing
  }
}

/** Calendar parts of `instant` as read in `timeZone`. */
export function zonedParts(instant, timeZone) {
  const d = new Date(instant)
  const shifted = new Date(d.getTime() + zoneOffsetMs(d, timeZone))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),     // 0 Sun .. 4 Thu .. 6 Sat
    hour: shifted.getUTCHours(),
  }
}

/** The UTC instant of a local wall-clock time in `timeZone`. */
export function zonedTimeToInstant({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const naive = Date.UTC(year, month, day, hour, minute, 0)
  // One correction handles every ordinary case; a second settles DST
  // boundaries, where the first guess can land on the wrong side of a change.
  let guess = naive - zoneOffsetMs(new Date(naive), timeZone)
  guess = naive - zoneOffsetMs(new Date(guess), timeZone)
  return guess
}

/**
 * The window during which this GP owns the Live tab:
 * Thursday 00:00 local through the following Wednesday 23:59:59.999 local.
 *
 * Anchored on the Thursday on-or-before the first session, so a weekend whose
 * running order starts on another day still anchors correctly.
 */
export function weekendWindow(sessions, timeZone = 'UTC') {
  if (!sessions?.length) return null

  const first = zonedParts(sessions[0].start, timeZone)
  const backToThursday = (first.weekday - 4 + 7) % 7   // 4 = Thursday

  const start = zonedTimeToInstant(
    { year: first.year, month: first.month, day: first.day - backToThursday, hour: 0 },
    timeZone,
  )
  const nextThursday = zonedTimeToInstant(
    { year: first.year, month: first.month, day: first.day - backToThursday + 7, hour: 0 },
    timeZone,
  )
  return { start, end: nextThursday - 1 }
}

/**
 * Resolve the weekend-level state.
 *
 * @param {object} input
 * @param {number} input.now            epoch ms (injectable, so this is testable)
 * @param {Array}  input.sessions       from buildSessions()
 * @param {string} input.timeZone       circuit's IANA zone
 * @param {object} input.actualEnds     { [sessionKey]: epochMs } real finishes
 *                                      observed from the feed. Always preferred
 *                                      over the nominal fallback, never
 *                                      overridden by it.
 * @param {string|null} input.liveSessionKey  session the feed reports as running
 */
export function resolveWeekendState({
  now = Date.now(),
  sessions = [],
  timeZone = 'UTC',
  actualEnds = {},
  liveSessionKey = null,
} = {}) {
  const window = weekendWindow(sessions, timeZone)

  const base = {
    state: WeekendState.OUTSIDE,
    window,
    currentSession: null,
    nextSession: null,
    msToNext: null,
    isSprintWeekend: sessions.some((s) => s.key === 'Sprint'),
  }

  if (!window || now < window.start || now > window.end) return base

  // A session's end: the real finish signal when we have one, otherwise the
  // scheduled start plus a nominal duration. The fallback must never shorten
  // or override a real observation.
  const endOf = (s) => {
    const actual = actualEnds[s.key]
    return Number.isFinite(actual) ? actual : s.start + nominalDurationMs(s.key)
  }

  const started = sessions.filter((s) => now >= s.start)
  const upcoming = sessions.filter((s) => now < s.start)
  const next = upcoming[0] ?? null
  const msToNext = next ? next.start - now : null

  // 1. A session the feed reports as live outranks the clock: a delayed or
  //    red-flagged session runs past its nominal end and is still live.
  if (liveSessionKey) {
    const live = sessions.find((s) => s.key === liveSessionKey)
    if (live) {
      return { ...base, state: WeekendState.SESSION_LIVE, currentSession: live, nextSession: next, msToNext }
    }
  }

  // 2. Inside a session's span.
  const running = started.find((s) => now < endOf(s))
  if (running) {
    return { ...base, state: WeekendState.SESSION_LIVE, currentSession: running, nextSession: next, msToNext }
  }

  // 3. Nothing has started yet → before FP1.
  if (!started.length) {
    return { ...base, state: WeekendState.PRE_WEEKEND, nextSession: next, msToNext }
  }

  const lastFinished = started[started.length - 1]

  // 4. The race is done → post-weekend until Wednesday.
  if (lastFinished.key === 'Race') {
    return {
      ...base, state: WeekendState.POST_WEEKEND,
      currentSession: lastFinished, nextSession: null, msToNext: null,
    }
  }

  // 5. Between sessions: the finished session's results, until T-30 of the
  //    next, then the idle card counting that next session down.
  if (next && msToNext <= GAP_IDLE_LEAD_MS) {
    return { ...base, state: WeekendState.GAP_IDLE, currentSession: lastFinished, nextSession: next, msToNext }
  }
  return { ...base, state: WeekendState.SESSION_RESULTS, currentSession: lastFinished, nextSession: next, msToNext }
}

// ── Sub-tab gating ─────────────────────────────────────────────────────────

export const LIVE_TABS = ['TOWER', 'STRATEGY', 'TELEMETRY', 'RADIO']

/**
 * Which Live sub-tabs may render data.
 *
 * One rule, not a table of special cases: after a qualifying-type session ends,
 * and until the race-type session whose grid it sets begins, only the Tower has
 * anything real to show. Strategy, telemetry and radio would otherwise display
 * qualifying data hours after qualifying, which reads as live.
 *
 * Covers Qualifying → Race and Sprint Qualifying → Sprint without naming either.
 */
export function allowedTabs({ state, currentSession, sessions = [], now = Date.now() }) {
  const all = Object.fromEntries(LIVE_TABS.map((t) => [t, true]))

  if (state === WeekendState.OUTSIDE || state === WeekendState.PRE_WEEKEND) {
    // Nothing has run yet; only the Tower's schedule card is meaningful.
    return { ...all, STRATEGY: false, TELEMETRY: false, RADIO: false, reason: 'pre_weekend' }
  }

  const inGridLimbo = (() => {
    if (!currentSession || currentSession.type !== 'qualifying') return false
    if (state === WeekendState.SESSION_LIVE) return false   // qualifying itself is live
    const consumer = gridConsumerFor(sessions, currentSession)
    return !consumer || now < consumer.start
  })()

  if (inGridLimbo) {
    return { ...all, STRATEGY: false, TELEMETRY: false, RADIO: false, reason: 'awaiting_grid' }
  }

  return { ...all, reason: null }
}

/** Why a tab is empty, in words a viewer can act on. */
export function disabledTabMessage(reason, { nextSession } = {}) {
  // Session labels are codes, not words — "fp1" and "sprint quali" read as
  // typos. Keep them as the schedule spells them.
  const next = nextSession?.label ?? 'the next session'
  switch (reason) {
    case 'awaiting_grid':
      return `No data between qualifying and ${next}. It returns when ${next} starts.`
    case 'pre_weekend':
      return `Nothing has run yet this weekend. Data appears once ${next} starts.`
    default:
      return 'No data for this part of the weekend.'
  }
}

// ── Tower content ──────────────────────────────────────────────────────────

export const TowerContent = {
  SCHEDULE: 'SCHEDULE',           // pre-weekend idle card
  PRACTICE: 'PRACTICE',
  QUALIFYING: 'QUALIFYING',
  STARTING_GRID: 'STARTING_GRID', // after qualifying, before its race
  RACE: 'RACE',
  CLASSIFICATION: 'CLASSIFICATION',
}

/** What the Tower should be showing for the current weekend phase. */
export function towerContentFor({ state, currentSession, sessions = [], now = Date.now() }) {
  if (state === WeekendState.OUTSIDE || state === WeekendState.PRE_WEEKEND) return TowerContent.SCHEDULE
  if (!currentSession) return TowerContent.SCHEDULE
  if (state === WeekendState.POST_WEEKEND) return TowerContent.CLASSIFICATION

  if (state === WeekendState.SESSION_LIVE) {
    if (currentSession.type === 'qualifying') return TowerContent.QUALIFYING
    if (currentSession.type === 'race') return TowerContent.RACE
    return TowerContent.PRACTICE
  }

  // Finished, between sessions.
  if (currentSession.type === 'qualifying') {
    const consumer = gridConsumerFor(sessions, currentSession)
    if (!consumer || now < consumer.start) return TowerContent.STARTING_GRID
  }
  if (currentSession.type === 'race') return TowerContent.CLASSIFICATION
  return TowerContent.PRACTICE
}

export { buildSessions }
