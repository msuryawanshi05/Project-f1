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
import { resolveSessionState, SessionState } from '../utils/sessionLifecycle'

const SESSION_LABELS = {
  FirstPractice:    'FP1',
  SecondPractice:   'FP2',
  ThirdPractice:    'FP3',
  SprintQualifying: 'SPRINT QUALIFYING',
  Sprint:           'SPRINT',
  Qualifying:       'QUALIFYING',
  Race:             'RACE',
}

/** Build ordered session list from a race object */
function buildSessions(race) {
  const order = ['FirstPractice', 'SecondPractice', 'ThirdPractice', 'SprintQualifying', 'Sprint', 'Qualifying']
  const sessions = []

  for (const key of order) {
    if (race[key]?.date) {
      sessions.push({
        key,
        label: SESSION_LABELS[key],
        date:  race[key].date,
        time:  race[key].time ?? '12:00:00Z',
      })
    }
  }

  // Race always last
  if (race.date) {
    sessions.push({
      key:   'Race',
      label: 'RACE',
      date:  race.date,
      time:  race.time ?? '14:00:00Z',
    })
  }

  return sessions.map((s) => ({
    ...s,
    dt: new Date(`${s.date}T${s.time}`),
  }))
}

export default function useRaceWeekendState() {
  const session     = useF1Store((s) => s.session)
  const calendar    = useF1Store((s) => s.calendar)
  const raceControl = useF1Store((s) => s.raceControl)
  const timing      = useF1Store((s) => s.timing)
  const sessionMeta = useF1Store((s) => s.sessionMeta)

  return useMemo(() => {
    const now = new Date()

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
      const finishedRace = calendar.find((race) => {
        const sessions = buildSessions(race)
        const last = sessions[sessions.length - 1]?.dt
        return last && now - last < 12 * 60 * 60 * 1000 && now >= last
      }) ?? null
      return {
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
  }, [session.phase, session.lap, calendar, raceControl, timing, sessionMeta])
}
