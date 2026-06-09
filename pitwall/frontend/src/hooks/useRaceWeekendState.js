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
import circuits from '../data/circuits.json'

const SESSION_LABELS = {
  FirstPractice:  'FP1',
  SecondPractice: 'FP2',
  ThirdPractice:  'FP3',
  Sprint:         'SPRINT',
  Qualifying:     'QUALIFYING',
  Race:           'RACE',
}

/** Build ordered session list from a race object */
function buildSessions(race) {
  const order = ['FirstPractice', 'SecondPractice', 'ThirdPractice', 'Sprint', 'Qualifying']
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

/** Match a Jolpica race to a circuits.json entry */
function matchCircuitData(race) {
  const rn = (race?.raceName ?? '').toLowerCase().replace(' grand prix', '').trim()
  return circuits.find((c) => {
    const cn = (c.name ?? '').toLowerCase().replace(' grand prix', '').trim()
    return cn.includes(rn) || rn.includes(cn)
  }) ?? null
}

export default function useRaceWeekendState() {
  const session  = useF1Store((s) => s.session)
  const calendar = useF1Store((s) => s.calendar)

  return useMemo(() => {
    const now = new Date()

    // ── SESSION_LIVE — trust the WebSocket phase ──────────────────────────────
    const isLivePhase = ['LIVE', 'RACE', 'QUALIFYING', 'PRACTICE'].includes(session.phase)
    if (isLivePhase) {
      return {
        mode: 'SESSION_LIVE',
        currentRace: null,
        nextSession: null,
        lastSession: null,
        weekendSessions: [],
        circuitData: null,
      }
    }

    if (!calendar.length) {
      return {
        mode: 'OFF_WEEKEND',
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
      const circuitData = matchCircuitData(race)

      // Classify each session
      const withStatus = sessions.map((s) => {
        const endDt = new Date(s.dt.getTime() + 90 * 60 * 1000) // +90min
        return {
          ...s,
          done:    now > endDt,
          live:    now >= s.dt && now <= endDt,
          upcoming: now < s.dt,
        }
      })

      const nextSession = withStatus.find((s) => s.upcoming) ?? null
      const lastSession = [...withStatus].reverse().find((s) => s.done) ?? null
      const minsUntilNext = nextSession ? (nextSession.dt - now) / 60000 : Infinity

      const mode = minsUntilNext <= 30
        ? 'WEEKEND_SESSION_SOON'
        : 'WEEKEND_BETWEEN_SESSIONS'

      return {
        mode,
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
      const circuitData = matchCircuitData(race)
      const firstDt = sessions[0]?.dt
      const daysUntil = firstDt ? (firstDt - now) / 86400000 : Infinity
      const mode = daysUntil <= 7 ? 'WEEKEND_UPCOMING' : 'OFF_WEEKEND'

      return {
        mode,
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
      currentRace: null,
      nextSession: null,
      lastSession: null,
      weekendSessions: [],
      circuitData: null,
    }
  }, [session.phase, calendar])
}
