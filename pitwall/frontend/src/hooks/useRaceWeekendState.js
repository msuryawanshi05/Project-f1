/**
 * useRaceWeekendState.js
 * Computes the current F1 race weekend "mode" from the Jolpica calendar
 * already loaded in the store. No extra API calls needed.
 *
 * Returns one of 5 modes:
 *   OFF_WEEKEND              — No race weekend active this week
 *   WEEKEND_UPCOMING         — Race weekend starts within 7 days (not yet today)
 *   WEEKEND_BETWEEN_SESSIONS — Race weekend is NOW, between sessions
 *   WEEKEND_SESSION_SOON     — A session starts within 30 minutes
 *   SESSION_LIVE             — Live WebSocket session active
 *
 * Also returns helpers:
 *   currentRace        — the active or next race from calendar
 *   nextSession        — { label, targetDt, raceName }
 *   lastSession        — { label, date } — last completed session this weekend
 *   weekendSessions    — all sessions for current race weekend with status
 *   circuitData        — matched entry from circuits.json
 */

import { useMemo } from 'react'
import useF1Store from '../store/useF1Store'
import { matchCircuit } from '../utils/circuitUtils'
import {
  resolveSessionState, SessionState,
  resolveWeekendState, allowedTabs, towerContentFor, WeekendState,
} from '../utils/sessionLifecycle'
import { buildSessions } from '../utils/sessionSchedule'


/**
 * Weekend-level view for the Live tab: which GP owns it right now, which
 * session it is about, which sub-tabs may render, and what the Tower shows.
 *
 * Separate from the per-session lifecycle above. That one answers "is THIS
 * session running / provisional / waiting on results"; this one answers "which
 * session are we even talking about", which is what decides whether strategy
 * and telemetry have anything real to show.
 */
/**
 * The feed names sessions ("Race", "Qualifying", "Sprint Qualifying"); the
 * schedule keys them by Jolpica's field names. Only report a live key when the
 * feed says the session is actually running — a stale name from a finished
 * session would otherwise pin the weekend state to SESSION_LIVE forever, which
 * is the same defect Phase C fixed at the session level.
 */
function sessionKeyFromName(name, phase) {
  if (!name || phase !== 'LIVE') return null
  const n = String(name).toUpperCase()
  if (n.includes('SPRINT') && (n.includes('QUALI') || n.includes('SHOOTOUT'))) return 'SprintQualifying'
  if (n.includes('SPRINT')) return 'Sprint'
  if (n.includes('QUALI') || n.includes('SHOOTOUT')) return 'Qualifying'
  if (n.includes('PRACTICE 1') || n === 'FP1') return 'FirstPractice'
  if (n.includes('PRACTICE 2') || n === 'FP2') return 'SecondPractice'
  if (n.includes('PRACTICE 3') || n === 'FP3') return 'ThirdPractice'
  if (n.includes('RACE')) return 'Race'
  return null
}

function buildWeekendView(calendar, now, { liveSessionKey = null, actualEnds = {} } = {}) {
  // The GP that owns the Live tab is the one whose Thursday-to-Wednesday window
  // contains `now`. Evaluated per race because each window is anchored in that
  // circuit's own timezone.
  for (const race of calendar) {
    const sessions = buildSessions(race)
    if (!sessions.length) continue
    const circuit = matchCircuit(race)
    const timeZone = circuit?.timezone ?? 'UTC'

    const weekend = resolveWeekendState({
      now: now.getTime(), sessions, timeZone, liveSessionKey, actualEnds,
    })
    if (weekend.state === WeekendState.OUTSIDE) continue

    return {
      ...weekend,
      race,
      circuitData: circuit,
      timeZone,
      sessions,
      tabs: allowedTabs({ ...weekend, sessions, now: now.getTime() }),
      towerContent: towerContentFor({ ...weekend, sessions, now: now.getTime() }),
    }
  }
  return null
}

export default function useRaceWeekendState() {
  const session     = useF1Store((s) => s.session)
  const calendar    = useF1Store((s) => s.calendar)
  const raceControl = useF1Store((s) => s.raceControl)
  const timing      = useF1Store((s) => s.timing)
  const sessionMeta = useF1Store((s) => s.sessionMeta)
  const results     = useF1Store((s) => s.results)

  return useMemo(() => {
    const now = new Date()

    // The feed knows which session is actually running; the schedule only
    // knows which one is scheduled. A delayed or red-flagged session is still
    // live past its nominal end, so the feed's view wins where it has one.
    const liveSessionKey = sessionKeyFromName(session.name, session.phase)
    const weekend = buildWeekendView(calendar, now, { liveSessionKey })

    // ── SESSION_LIVE — trust the WebSocket phase, active lap count, or active formation lap ────────
    // A formation-lap message only means the session is starting if it is
    // RECENT. Scanning all 50 retained messages with no time bound meant an
    // hour-old "FORMATION LAP" line kept forcing the live branch — the same
    // stale-message defect fixed in StatusBar and BroadcastBanner.
    const RC_FRESH_MS = 10 * 60 * 1000
    const isFormation = raceControl.some((m) => {
      const ts = m.time ? Date.parse(m.time) : NaN
      if (!Number.isFinite(ts) || now.getTime() - ts > RC_FRESH_MS) return false
      const t = (m.message || m.msg || '').toUpperCase()
      return t.includes('FORMATION LAP') || t.includes('START PROCEDURE')
    })

    // Session lifecycle, resolved from the clock plus the feed — NOT from the
    // presence of timing rows.
    //
    // The previous expression was:
    //   isFormation || [LIVE,RACE,...].includes(phase)
    //     || Boolean(session.lap && session.lap >= 1)
    //     || (timing.length > 0 && session.phase !== 'PRE')
    //
    // After the chequered flag session.lap is 62 and timing is still populated
    // from the retained cache, so the last two disjuncts stayed true forever
    // and a finished race never stopped being "live".
    // Which round are we most likely waiting on, and do we already have its
    // classification cached?
    const latestStartedRound = [...calendar]
      .filter((race) => {
        const sessions = buildSessions(race)
        const last = sessions[sessions.length - 1]?.dt
        return last && now >= last
      })
      .sort((a, b) => Number(a.round) - Number(b.round))
      .at(-1)?.round ?? null
    const cachedResult = latestStartedRound != null ? results[latestStartedRound] : null
    const hasPublishedResults = Boolean(
      cachedResult && !cachedResult.empty && !cachedResult.pending && !cachedResult.ongoing
    )

    const feedLive = isFormation
      || ['LIVE', 'RACE', 'QUALIFYING', 'PRACTICE', 'FORMATION'].includes(session.phase)
    const lifecycle = resolveSessionState({
      now: now.getTime(),
      sessionStart: sessionMeta.dateStart,
      sessionEnd: sessionMeta.dateEnd,
      // Only trust "the feed is live" when the feed says so AND the schedule
      // has not already closed the session out by more than the grace window.
      liveFeedActive: feedLive && session.phase !== 'FINISHED',
      feedFinished: session.phase === 'FINISHED',
      hasTimingState: timing.length > 0,
      // Results supersede the provisional/pending states. `results` is keyed by
      // round and populated by the Results page (and by the Live page's own
      // check), so once a classification is published the Live page stops
      // saying it is waiting for one.
      hasOfficialResults: hasPublishedResults,
    })

    if (lifecycle.showTower) {
      let activeRace = null
      for (const race of calendar) {
        const sessions = buildSessions(race)
        if (!sessions.length) continue
        const firstDt = sessions[0].dt
        const lastDt  = sessions[sessions.length - 1].dt
        const lastDtEnd = new Date(lastDt.getTime() + 4 * 60 * 60 * 1000)
        if (now >= firstDt && now <= lastDtEnd) {
          activeRace = { race, sessions }
          break
        }
      }

      // Fallback: find nearest race if clock is slightly off
      if (!activeRace && calendar.length) {
        let minDiff = Infinity
        let bestRace = null
        for (const race of calendar) {
          const sessions = buildSessions(race)
          const raceDt = sessions[sessions.length - 1]?.dt
          if (raceDt) {
            const diff = Math.abs(now - raceDt)
            if (diff < minDiff) {
              minDiff = diff
              bestRace = { race, sessions }
            }
          }
        }
        activeRace = bestRace
      }

      const race = activeRace?.race ?? null
      const circuitData = race ? matchCircuit(race) : null

      return {
        weekend,
        // SESSION_LIVE covers both a running session and the provisional
        // window, because both render the tower. `provisional` distinguishes
        // them and the header must not say "live" when it is set.
        mode: 'SESSION_LIVE',
        sessionState: lifecycle.state,
        provisional: lifecycle.provisional,
        isLive: lifecycle.isLive,
        currentRace: race,
        nextSession: null,
        lastSession: null,
        weekendSessions: activeRace ? activeRace.sessions : [],
        circuitData,
      }
    }

    // Session is over and the tower is no longer the right surface. Surface the
    // state so the Live page can say whether official results are merely
    // pending (Jolpica lags by minutes to hours) rather than showing nothing.
    if (lifecycle.state === SessionState.RESULTS_PENDING) {
      // The most recently STARTED race. There is deliberately no upper time
      // bound: a classification can stay unpublished for many hours, and a
      // 12-hour cap meant that a day later we could no longer name the race we
      // were waiting on, so the panel lost its circuit, title and map.
      const finishedRace = [...calendar]
        .filter((race) => {
          const sessions = buildSessions(race)
          const last = sessions[sessions.length - 1]?.dt
          return last && now >= last
        })
        .sort((a, b) => Number(a.round) - Number(b.round))
        .at(-1) ?? null
      return {
        weekend,
        mode: 'RESULTS_PENDING',
        sessionState: lifecycle.state,
        provisional: false,
        isLive: false,
        currentRace: finishedRace,
        nextSession: null,
        lastSession: null,
        weekendSessions: finishedRace ? buildSessions(finishedRace) : [],
        circuitData: finishedRace ? matchCircuit(finishedRace) : null,
      }
    }

    if (!calendar.length) {
      return {
        weekend,
        mode: 'OFF_WEEKEND',
        sessionState: SessionState.IDLE,
        provisional: false,
        isLive: false,
        currentRace: null,
        nextSession: null,
        lastSession: null,
        weekendSessions: [],
        circuitData: null,
      }
    }

    // ── Find the "active" race weekend ────────────────────────────────────────
    // A weekend is "active" if the first session started ≤ 7 days ago and race hasn't ended.
    let activeRace = null
    let nextFutureRace = null

    for (const race of calendar) {
      const sessions = buildSessions(race)
      if (!sessions.length) continue

      const firstDt = sessions[0].dt
      const lastDt  = sessions[sessions.length - 1].dt
      const lastDtEnd = new Date(lastDt.getTime() + 4 * 60 * 60 * 1000) // +4h for race duration

      const daysUntilFirst = (firstDt - now) / 86400000

      if (now >= firstDt && now <= lastDtEnd) {
        // We're inside this race weekend window
        activeRace = { race, sessions }
        break
      }

      if (daysUntilFirst > 0 && daysUntilFirst <= 7 && !nextFutureRace) {
        nextFutureRace = { race, sessions }
      }

      if (daysUntilFirst > 7 && !nextFutureRace) {
        nextFutureRace = { race, sessions }
      }
    }

    // Also find the very next future race
    if (!nextFutureRace) {
      for (const race of calendar) {
        const sessions = buildSessions(race)
        if (!sessions.length) continue
        const firstDt = sessions[0].dt
        if (firstDt > now) {
          nextFutureRace = { race, sessions }
          break
        }
      }
    }

    // ── ACTIVE WEEKEND ────────────────────────────────────────────────────────
    if (activeRace) {
      const { race, sessions } = activeRace
      const circuitData = matchCircuit(race)

      // Classify each session
      const withStatus = sessions.map((s) => {
        const durationMinutes = s.key === 'Race' ? 180 : 90
        const endDt = new Date(s.dt.getTime() + durationMinutes * 60 * 1000)
        return {
          ...s,
          done:    now > endDt,
          live:    now >= s.dt && now <= endDt,
          upcoming: now < s.dt,
        }
      })

      const liveSession = withStatus.find((s) => s.live) ?? null
      const nextSession = withStatus.find((s) => s.upcoming) ?? null
      const lastSession = [...withStatus].reverse().find((s) => s.done) ?? null
      const minsUntilNext = nextSession ? (nextSession.dt - now) / 60000 : Infinity

      const mode = liveSession
        ? 'SESSION_LIVE'
        : minsUntilNext <= 30
        ? 'WEEKEND_SESSION_SOON'
        : 'WEEKEND_BETWEEN_SESSIONS'

      return {
        weekend,
        mode,
        sessionState: lifecycle.state,
        provisional: false,
        isLive: false,
        currentRace:    race,
        nextSession:    nextSession ? {
          label:    nextSession.label,
          targetDt: nextSession.dt,
          raceName: race.raceName,
          round:    race.round,
        } : null,
        lastSession: lastSession ? {
          label: lastSession.label,
          date:  lastSession.date,
          round: race.round,
        } : null,
        weekendSessions: withStatus,
        circuitData,
      }
    }

    // ── OFF WEEKEND / UPCOMING ────────────────────────────────────────────────
    if (nextFutureRace) {
      const { race, sessions } = nextFutureRace
      const circuitData = matchCircuit(race)
      const firstDt = sessions[0]?.dt
      const daysUntil = firstDt ? (firstDt - now) / 86400000 : Infinity
      const mode = daysUntil <= 7 ? 'WEEKEND_UPCOMING' : 'OFF_WEEKEND'

      return {
        weekend,
        mode,
        sessionState: lifecycle.state,
        provisional: false,
        isLive: false,
        currentRace: race,
        nextSession: sessions[0] ? {
          label:    sessions[0].label,
          targetDt: sessions[0].dt,
          raceName: race.raceName,
          round:    race.round,
        } : null,
        lastSession:     null,
        weekendSessions: sessions.map((s) => ({ ...s, done: false, live: false, upcoming: true })),
        circuitData,
      }
    }

    return {
      weekend,
      mode: 'OFF_WEEKEND',
      sessionState: SessionState.IDLE,
      provisional: false,
      isLive: false,
      currentRace: null,
      nextSession: null,
      lastSession: null,
      weekendSessions: [],
      circuitData: null,
    }
    // session.lap, raceControl and timing are all READ inside this memo
    // (isLivePhase / isFormation), so they must be listed. Without them the
    // mode never flipped to SESSION_LIVE when timing started arriving without
    // an accompanying phase change.
  }, [session.phase, session.lap, calendar, raceControl, timing, sessionMeta, results])
}
