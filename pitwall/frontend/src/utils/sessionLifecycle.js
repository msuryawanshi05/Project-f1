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

/** How long after the chequered flag the retained timing state is the best source. */
export const PROVISIONAL_WINDOW_MS = 30 * 60 * 1000

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
      return build(SessionState.RESULTS_PENDING)
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
