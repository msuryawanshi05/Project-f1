/**
 * sessionSchedule.js — the one place a race weekend's session list is built.
 *
 * There were two builders: useRaceWeekendState had `buildSessions`, and
 * CircuitDetailPanel assembled its own inline list. The second disagreed with
 * the first on sprint weekends — it guessed that SecondPractice meant "sprint
 * qualifying" from a boolean on circuits.json, when Jolpica supplies a
 * dedicated `SprintQualifying` key. On a 2026 sprint weekend that mislabels the
 * schedule the user reads.
 *
 * Session types matter beyond display. The weekend state machine needs to know
 * which sessions SET A GRID and which sessions USE one, because the rule for
 * hiding strategy/telemetry/radio is "after a qualifying-type session, until
 * the race-type session whose grid it sets" — not two hardcoded special cases.
 */

/** Jolpica key → display label and semantics. Order is the running order. */
export const SESSION_TYPES = [
  { key: 'FirstPractice',    label: 'FP1',              type: 'practice',   nominalMinutes: 60 },
  { key: 'SecondPractice',   label: 'FP2',              type: 'practice',   nominalMinutes: 60 },
  { key: 'ThirdPractice',    label: 'FP3',              type: 'practice',   nominalMinutes: 60 },
  { key: 'SprintQualifying', label: 'SPRINT QUALI',     type: 'qualifying', nominalMinutes: 45 },
  { key: 'Sprint',           label: 'SPRINT',           type: 'race',       nominalMinutes: 35 },
  { key: 'Qualifying',       label: 'QUALIFYING',       type: 'qualifying', nominalMinutes: 60 },
  { key: 'Race',             label: 'RACE',             type: 'race',       nominalMinutes: 120 },
]

const BY_KEY = Object.fromEntries(SESSION_TYPES.map((s) => [s.key, s]))

/**
 * Nominal durations are a FALLBACK only.
 *
 * They exist so the state machine can advance when the feed has not told us a
 * session ended — out of season, on a cold load, or when the upstream feed is
 * blocked. A real finish signal always wins; see resolveWeekendState.
 * Values are from observed 2026 sessions (OpenF1 date_start/date_end).
 */
export function nominalDurationMs(sessionKey) {
  return (BY_KEY[sessionKey]?.nominalMinutes ?? 60) * 60 * 1000
}

export function sessionType(sessionKey) {
  return BY_KEY[sessionKey]?.type ?? 'practice'
}

/**
 * Build the ordered session list for one Jolpica race object.
 *
 * @returns {Array<{key,label,type,date,time,start:number,nominalEnd:number}>}
 *          `start` and `nominalEnd` are epoch ms.
 */
export function buildSessions(race) {
  if (!race) return []
  const out = []

  for (const spec of SESSION_TYPES) {
    if (spec.key === 'Race') continue          // handled below, from the race root
    const entry = race[spec.key]
    if (!entry?.date) continue
    out.push({ ...spec, date: entry.date, time: entry.time ?? '12:00:00Z' })
  }

  if (race.date) {
    const spec = BY_KEY.Race
    out.push({ ...spec, date: race.date, time: race.time ?? '14:00:00Z' })
  }

  return out
    .map((s) => {
      // Jolpica times are UTC and carry a trailing Z. Normalise defensively:
      // a bare "14:00:00" parsed without a zone would be read as local time,
      // which silently shifts every boundary by the user's offset.
      const time = /[Zz]|[+-]\d{2}:?\d{2}$/.test(s.time) ? s.time : `${s.time}Z`
      const start = Date.parse(`${s.date}T${time}`)
      return Number.isFinite(start)
        ? { ...s, start, dt: new Date(start), nominalEnd: start + nominalDurationMs(s.key) }
        : null
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)
}

/**
 * The race-type session whose grid a qualifying session sets: the next
 * race-type session after it in the running order.
 *
 * This is the generalised form of "Qualifying → Race" and "Sprint Qualifying →
 * Sprint". Expressing it as a rule rather than two cases means a format change
 * — a second sprint, a reordered weekend — does not need new branches.
 */
export function gridConsumerFor(sessions, qualifyingSession) {
  if (!qualifyingSession || qualifyingSession.type !== 'qualifying') return null
  return sessions.find((s) => s.type === 'race' && s.start > qualifyingSession.start) ?? null
}

export default buildSessions
