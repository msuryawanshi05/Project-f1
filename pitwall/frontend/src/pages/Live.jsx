import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import useF1Store from '../store/useF1Store'
import useRaceWeekendState from '../hooks/useRaceWeekendState'
import { useOpenF1Stints, useOpenF1Status } from '../hooks/useOpenF1'
import DriverRow from '../components/ui/DriverRow'
import TrackStatusBanner from '../components/ui/TrackStatusBanner'
import TrackMap from '../components/ui/TrackMap'
import BroadcastBanner from '../components/ui/BroadcastBanner'
import SpotlightPanel from '../components/ui/SpotlightPanel'
import { EmptyState } from '../components/ui/EmptyState'
import { getTeamColour, formatCountdown, formatSessionTime, parseGapToSeconds } from '../utils/driverUtils'
import StrategyTab from './live/StrategyTab'
import TelemetryTab from './live/TelemetryTab'
import RadioTab from './live/RadioTab'
import { useQualifyingGrid } from '../hooks/useQualifyingGrid'
import { getTowerColumns, towerGridTemplate, towerMinWidth, LIVE_SPACING, SIDEBAR } from '../utils/layoutConstants'
import useResizableSidebar from '../hooks/useResizableSidebar'
import { getQualifyingCut, isQualifyingSessionName, qualifyingHeaderLabel } from '../utils/qualifyingUtils'
import {
  SessionState, sessionStateLabel,
  WeekendState, TowerContent, disabledTabMessage, LIVE_TABS,
} from '../utils/sessionLifecycle'
import { buildStartingGrid } from '../utils/startingGrid'
import ReplayBar from '../components/replay/ReplayBar'
import ReplayLauncher from '../components/replay/ReplayLauncher'
import { useReplayCatalogue } from '../hooks/useReplay'
import QualifyingGridTower from '../components/ui/QualifyingGridTower'

// ── Countdown inline ──────────────────────────────────────────────────────────
function useCountdownSeconds(targetDt) {
  const [seconds, setSeconds] = useState(null)
  useEffect(() => {
    if (!targetDt) return
    const tick = () => {
      const ms = targetDt - Date.now()
      if (ms <= 0) { setSeconds(null); return }
      setSeconds(Math.floor(ms / 1000))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetDt])
  return seconds
}

// ── Weather tile ───────────────────────────────────────────────────────────────────
function WeatherTile({ label, value, accent = false }) {
  return (
    <div className="border border-pitwall-border p-3 flex flex-col gap-1"
      style={{ background: 'var(--pw-surface)' }}>
      <div className="font-mono text-[10px] tracking-widest uppercase"
        style={{ color: 'var(--pw-ghost)' }}>{label}</div>
      <div className="font-mono text-lg font-medium"
        style={{ color: accent ? 'var(--pw-green)' : 'var(--pw-text-strong)' }}>
        {value ?? '—'}
      </div>
    </div>
  )
}

// ── Session schedule row ──────────────────────────────────────────────────────
function SessionRow({ session }) {
  const dot = session.done
    ? 'text-pitwall-ghost'
    : session.live
    ? 'text-status-green'
    : 'text-pitwall-dim'

  const label = session.done ? '✓' : session.live ? '●' : '○'

  const timeStr = session.dt
    ? formatSessionTime(session.dt, null, true)
    : '—'

  return (
    <div className={`flex items-center gap-2 py-1.5 border-b border-[#1a1a1a] ${session.live ? 'bg-status-green/5' : ''}`}>
      <span className={`font-mono text-[10px] w-4 ${dot}`}>{label}</span>
      <span className={`font-mono text-[11px] flex-1 ${session.done ? 'text-pitwall-ghost line-through' : session.live ? 'text-status-green font-bold' : 'text-pitwall-dim'}`}>
        {session.label}
      </span>
      <span className="font-mono text-[10px] text-pitwall-ghost">{timeStr}</span>
    </div>
  )
}

// ── Weekend side panel ────────────────────────────────────────────────────────
function WeekendPanel({ weekendState, weather }) {
  const { mode, currentRace, nextSession, weekendSessions, circuitData } = weekendState
  const countdownSeconds = useCountdownSeconds(nextSession?.targetDt)

  if (mode === 'SESSION_LIVE') {
    // Live weather panel
    return (
      <div className="p-4 bg-pitwall-surface">
        <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase mb-3">Weather</div>
        {weather ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <WeatherTile label="Track Temp" value={`${weather.track_temp ?? '—'}°C`} />
              <WeatherTile label="Air Temp"   value={`${weather.air_temp ?? '—'}°C`} />
              <WeatherTile label="Humidity"   value={`${weather.humidity ?? '—'}%`} />
              <WeatherTile label="Conditions" value={weather.rainfall ? 'WET' : 'DRY'} accent={!weather.rainfall} />
            </div>
            <div className="font-mono text-xs text-pitwall-dim">
              Wind: {weather.wind_speed ?? '—'} km/h{weather.wind_direction ? ` · ${weather.wind_direction}°` : ''}
            </div>
          </>
        ) : (
          <div className="font-mono text-xs text-pitwall-ghost">Weather data not available</div>
        )}
      </div>
    )
  }

  const isWeekend = mode === 'WEEKEND_BETWEEN_SESSIONS' || mode === 'WEEKEND_SESSION_SOON'
  // A race that has just run is not "upcoming". Without this case the sidebar
  // labelled a finished Grand Prix as the next one.
  const headerLabel = mode === 'RESULTS_PENDING'
    ? 'JUST FINISHED'
    : isWeekend
    ? 'RACE WEEKEND IN PROGRESS'
    : 'UPCOMING RACE'

  return (
    <div className="overflow-y-auto h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="font-mono text-[9px] text-pitwall-ghost tracking-widest uppercase mb-1">{headerLabel}</div>
        {currentRace && (
          <div className="font-display font-bold text-sm text-pitwall-text-strong tracking-wide uppercase leading-tight">
            {currentRace.raceName?.replace(' Grand Prix', ' GP')}
          </div>
        )}
        {circuitData && (
          <div className="font-mono text-[10px] text-pitwall-ghost mt-0.5">
            {circuitData.circuit} · {circuitData.city}
          </div>
        )}
      </div>

      {/* Track map */}
      <div className="px-4 pb-3">
        <TrackMap circuitData={circuitData} compact showStats />
      </div>

      {/* Countdown to next session */}
      {nextSession && (
        <div className="mx-4 mb-3 px-3 py-2.5 border border-pitwall-border"
          style={{ background: 'var(--pw-surface)' }}>
          <div className="font-mono text-[9px] tracking-widest uppercase mb-1"
            style={{ color: 'var(--pw-ghost)' }}>
            Next Session
          </div>
          <div className="flex items-center justify-between">
            <span className="font-display text-xs text-pitwall-dim uppercase tracking-wider">
              {nextSession.label}
            </span>
            {countdownSeconds !== null && (
              <span className="font-mono text-xs text-pitwall-text-strong tabular-nums font-semibold">
                {formatCountdown(countdownSeconds)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Session schedule */}
      {weekendSessions.length > 0 && (
        <div className="px-4 pb-4">
          <div className="font-mono text-[9px] text-pitwall-ghost tracking-widest uppercase mb-2">
            Weekend Schedule
          </div>
          {weekendSessions.map((s) => (
            <SessionRow key={s.key} session={s} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Timing tower left panel info ──────────────────────────────────────────────
function TowerEmptyState({ weekendState }) {
  const { mode, currentRace, nextSession, lastSession, circuitData } = weekendState
  const countdownSeconds = useCountdownSeconds(nextSession?.targetDt)

  if (mode === 'WEEKEND_BETWEEN_SESSIONS' || mode === 'WEEKEND_SESSION_SOON') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
        <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase">
          Race Weekend · {currentRace?.raceName?.replace(' Grand Prix', ' GP')}
        </div>
        {lastSession && (
          <div className="font-mono text-xs text-pitwall-dim">
            ✓ {lastSession.label} complete
          </div>
        )}
        {nextSession && countdownSeconds !== null && (
          <div className="flex flex-col items-center gap-1 mt-2">
            <div className="font-mono text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--pw-ghost)' }}>
              {nextSession.label} starts in
            </div>
            <div className="font-mono text-xl font-bold tabular-nums"
              style={{ color: 'var(--pw-text-strong)' }}>
              {formatCountdown(countdownSeconds)}
            </div>
          </div>
        )}
        {nextSession && countdownSeconds === null && (
          <div className="font-display text-sm text-status-red tracking-widest uppercase animate-pulse">
            {nextSession.label} starting soon
          </div>
        )}
        <div className="font-mono text-[10px] text-pitwall-ghost/50 mt-4">
          Timing tower activates 5 min before session
        </div>
      </div>
    )
  }

  if (mode === 'WEEKEND_UPCOMING') {
    const daysUntil = nextSession?.targetDt
      ? Math.ceil((nextSession.targetDt - Date.now()) / 86400000)
      : null
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-8 text-center">
        <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase">
          {currentRace?.raceName}
        </div>
        {circuitData && (
          <div className="font-mono text-xs text-pitwall-dim">{circuitData.circuit}</div>
        )}
        {daysUntil !== null && (
          <div className="font-mono text-2xl text-pitwall-text-strong mt-2">
            {daysUntil}d
            <span className="text-pitwall-ghost text-sm ml-1">until {nextSession?.label}</span>
          </div>
        )}
        <div className="font-mono text-[10px] text-pitwall-ghost/50 mt-4">
          Timing tower activates 5 min before session
        </div>
      </div>
    )
  }

  if (mode === 'RESULTS_PENDING') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
        <span className="text-3xl" role="img" aria-hidden="true">🏁</span>
        <div className="font-display text-sm font-bold tracking-widest uppercase text-pitwall-text-strong">
          Session Complete
        </div>
        {currentRace && (
          <div className="font-mono text-xs text-pitwall-dim">
            {currentRace.raceName?.replace(' Grand Prix', ' GP')}
          </div>
        )}
        {/* Jolpica publishes a classification minutes to hours after the flag —
            round 17 still returned total=0 an hour afterwards. An explicit wait
            state beats an empty table that looks broken. */}
        <div className="font-mono text-[11px] text-pitwall-dim max-w-xs leading-relaxed mt-1">
          Official classification has not been published yet. It usually appears within a
          few hours of the chequered flag.
        </div>
        <Link
          to="/results"
          className="font-mono text-[10px] tracking-widest uppercase underline text-pitwall-ghost hover:text-pitwall-text-strong mt-2"
        >
          Go to results
        </Link>
      </div>
    )
  }

  return (
    <EmptyState
      icon="🏁"
      title="No session active"
      message="PITWALL activates 5 minutes before each session"
    />
  )
}

// ── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonDriverRow() {
  return (
    <div className="flex items-center h-9 animate-pulse" style={{ borderBottom: '1px solid #1a1a1a' }}>
      <div className="w-[3px] h-full bg-[#222]" />
      <div className="w-10 flex justify-center"><div className="w-5 h-3 bg-[#1e1e1e] rounded" /></div>
      <div className="w-7 flex justify-center"><div className="w-4 h-3 bg-[#1e1e1e] rounded" /></div>
      <div className="w-14"><div className="w-10 h-3 bg-[#1e1e1e] rounded" /></div>
      <div className="w-20"><div className="w-14 h-3 bg-[#1e1e1e] rounded" /></div>
      <div className="w-24"><div className="w-16 h-3 bg-[#1e1e1e] rounded" /></div>
      <div className="w-16"><div className="w-10 h-3 bg-[#1e1e1e] rounded" /></div>
      <div className="w-16"><div className="w-10 h-3 bg-[#1e1e1e] rounded" /></div>
      <div className="w-16"><div className="w-10 h-3 bg-[#1e1e1e] rounded" /></div>
      <div className="w-12 flex justify-center"><div className="w-6 h-6 rounded-full bg-[#1e1e1e]" /></div>
      <div className="w-8 flex justify-center"><div className="w-3 h-3 bg-[#1e1e1e] rounded" /></div>
    </div>
  )
}

// ── Weekend phase cards ───────────────────────────────────────────────────────
//
// Three of the five weekend phases have no timing data by definition: before
// FP1, between sessions, and the stretch after qualifying. Each gets a card
// that says which phase it is and what happens next, because "empty tower" and
// "broken tower" look identical otherwise.

/** A session time in the circuit's own clock — the one the schedule is in. */
function circuitTime(instant, timeZone) {
  if (!Number.isFinite(instant)) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(instant))
  } catch {
    return new Date(instant).toUTCString().slice(0, 16)
  }
}

/** The same instant in the viewer's clock, for when the two differ. */
function localTime(instant) {
  if (!Number.isFinite(instant)) return '—'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(instant))
}

function WeekendCountdown({ targetDt, label }) {
  const seconds = useCountdownSeconds(targetDt)
  if (seconds === null) {
    return (
      <div className="font-display text-sm text-status-red tracking-widest uppercase animate-pulse">
        {label} starting
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--pw-ghost)' }}>
        {label} starts in
      </div>
      <div className="font-mono text-2xl font-bold tabular-nums" style={{ color: 'var(--pw-text-strong)' }}>
        {formatCountdown(seconds)}
      </div>
    </div>
  )
}

/**
 * The full running order for the weekend, with the phase marked.
 *
 * Times are shown in the circuit's timezone first — that is the clock the
 * session times are quoted in everywhere else — and in the viewer's only when
 * it differs, so a viewer at the track is not shown the same time twice.
 */
function WeekendRunningOrder({ weekend }) {
  const { sessions = [], currentSession, nextSession, timeZone } = weekend
  if (!sessions.length) return null

  const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const sameZone = viewerZone === timeZone

  return (
    <div className="w-full max-w-sm mt-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-[9px] tracking-widest uppercase" style={{ color: 'var(--pw-ghost)' }}>
          Weekend schedule
        </span>
        <span className="font-mono text-[9px]" style={{ color: 'var(--pw-ghost)' }}>
          {sameZone ? 'local' : `circuit · ${timeZone?.split('/').pop()?.replace('_', ' ')}`}
        </span>
      </div>
      {sessions.map((sess) => {
        const done = currentSession ? sess.start < currentSession.start : false
        const isCurrent = currentSession?.key === sess.key
        const isNext = nextSession?.key === sess.key
        return (
          <div
            key={sess.key}
            className="flex items-center gap-2 py-1.5 border-b"
            style={{ borderColor: 'var(--pw-border)' }}
          >
            <span className="font-mono text-[10px] w-4" style={{ color: 'var(--pw-ghost)' }}>
              {done || isCurrent ? '✓' : isNext ? '▸' : '○'}
            </span>
            <span
              className="font-mono text-[11px] flex-1 tracking-wide"
              style={{
                color: isNext ? 'var(--pw-text-strong)' : done ? 'var(--pw-ghost)' : 'var(--pw-dim)',
                fontWeight: isNext ? 700 : 400,
              }}
            >
              {sess.label}
            </span>
            <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--pw-ghost)' }}>
              {circuitTime(sess.start, timeZone)}
              {!sameZone && <span className="ml-1.5 opacity-60">({localTime(sess.start)})</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Before FP1: which Grand Prix this is, the running order, and the countdown. */
function PreWeekendCard({ weekend }) {
  const gp = weekend.race?.raceName?.replace(' Grand Prix', ' GP') ?? 'Race weekend'
  return (
    <div className="flex flex-col items-center justify-start h-full gap-2 px-6 py-8 overflow-y-auto text-center">
      <div className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--pw-ghost)' }}>
        Race weekend · nothing has run yet
      </div>
      <div className="font-display text-base font-bold tracking-wide uppercase" style={{ color: 'var(--pw-text-strong)' }}>
        {gp}
      </div>
      {weekend.circuitData && (
        <div className="font-mono text-[11px]" style={{ color: 'var(--pw-dim)' }}>
          {weekend.circuitData.circuit} · {weekend.circuitData.city}
          {weekend.isSprintWeekend && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold border border-status-red/40 bg-status-red/15 text-status-red">
              SPRINT
            </span>
          )}
        </div>
      )}
      {weekend.nextSession && (
        <div className="mt-3">
          <WeekendCountdown
            targetDt={weekend.nextSession.start}
            label={weekend.nextSession.label}
          />
        </div>
      )}
      <WeekendRunningOrder weekend={weekend} />
      <div className="font-mono text-[10px] mt-4" style={{ color: 'var(--pw-ghost)', opacity: 0.6 }}>
        The timing tower activates when the session goes green.
      </div>
    </div>
  )
}

/** Inside the weekend, no session running, next one close enough to count down. */
function GapIdleCard({ weekend }) {
  const gp = weekend.race?.raceName?.replace(' Grand Prix', ' GP') ?? ''
  return (
    <div className="flex flex-col items-center justify-start h-full gap-2 px-6 py-8 overflow-y-auto text-center">
      <span className="text-3xl" role="img" aria-hidden="true">⏱️</span>
      <div className="font-display text-sm font-bold tracking-widest uppercase" style={{ color: 'var(--pw-text-strong)' }}>
        No session active
      </div>
      <div className="font-mono text-[11px] max-w-xs leading-relaxed" style={{ color: 'var(--pw-dim)' }}>
        PITWALL activates 5 minutes before each session.
      </div>
      {gp && (
        <div className="font-mono text-[10px] tracking-widest uppercase mt-1" style={{ color: 'var(--pw-ghost)' }}>
          {gp}
        </div>
      )}
      {weekend.currentSession && (
        <div className="font-mono text-[11px] mt-1" style={{ color: 'var(--pw-dim)' }}>
          ✓ {weekend.currentSession.label} complete
        </div>
      )}
      {weekend.nextSession && (
        <div className="mt-3">
          <WeekendCountdown targetDt={weekend.nextSession.start} label={weekend.nextSession.label} />
        </div>
      )}
      <WeekendRunningOrder weekend={weekend} />
    </div>
  )
}

/**
 * After the race, until the weekend window closes on Wednesday.
 *
 * The legacy layer moves `currentRace` on to the NEXT Grand Prix the moment a
 * race finishes, which on Monday morning left the tower counting down to a race
 * five days away while the page's own state said the weekend just gone was
 * still the subject. Here the subject is the race that ran.
 */
function PostWeekendCard({ weekend, classification, nextRace, nextSessionDt }) {
  const gp = weekend.race?.raceName?.replace(' Grand Prix', ' GP') ?? 'Grand Prix'
  const podium = Array.isArray(classification) ? classification.slice(0, 3) : []
  const seconds = useCountdownSeconds(nextSessionDt)

  return (
    <div className="flex flex-col items-center justify-start h-full gap-2 px-6 py-8 overflow-y-auto text-center">
      <span className="text-3xl" role="img" aria-hidden="true">🏁</span>
      <div className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--pw-ghost)' }}>
        Race complete
      </div>
      <div className="font-display text-base font-bold tracking-wide uppercase" style={{ color: 'var(--pw-text-strong)' }}>
        {gp}
      </div>
      {weekend.circuitData && (
        <div className="font-mono text-[11px]" style={{ color: 'var(--pw-dim)' }}>
          {weekend.circuitData.circuit} · {weekend.circuitData.city}
        </div>
      )}

      {podium.length > 0 ? (
        <div className="w-full max-w-xs mt-4">
          {podium.map((r, i) => (
            <div
              key={r.position ?? i}
              className="flex items-center gap-3 py-2 border-b"
              style={{ borderColor: 'var(--pw-border)' }}
            >
              <span className="font-mono text-[11px] w-5 font-bold" style={{ color: 'var(--pw-ghost)' }}>
                P{r.position}
              </span>
              <span className="font-display text-xs font-bold flex-1 text-left tracking-wide" style={{ color: 'var(--pw-text-strong)' }}>
                {r.Driver?.code ?? r.Driver?.familyName ?? '—'}
              </span>
              <span className="font-mono text-[10px] truncate" style={{ color: 'var(--pw-dim)' }}>
                {r.Constructor?.name ?? ''}
              </span>
            </div>
          ))}
        </div>
      ) : (
        /* Jolpica publishes minutes to hours after the flag. Saying so beats an
           empty podium that reads as a failure. */
        <div className="font-mono text-[11px] max-w-xs leading-relaxed mt-3" style={{ color: 'var(--pw-dim)' }}>
          Official classification has not been published yet. It usually appears within a
          few hours of the chequered flag.
        </div>
      )}

      <Link
        to="/results"
        className="font-mono text-[10px] tracking-widest uppercase underline mt-3"
        style={{ color: 'var(--pw-ghost)' }}
      >
        Full results
      </Link>

      {nextRace && (
        <div className="font-mono text-[10px] mt-6" style={{ color: 'var(--pw-ghost)' }}>
          Next up · {nextRace.raceName?.replace(' Grand Prix', ' GP')}
          {seconds !== null && <span className="ml-1.5">in {formatCountdown(seconds)}</span>}
        </div>
      )}
    </div>
  )
}

/**
 * A sub-tab that has nothing real to show for this phase of the weekend.
 *
 * The tab itself stays enabled and reachable — a nav item that greys out is
 * indistinguishable from one that is broken. What changes is the panel, which
 * says plainly why it is empty and when it fills up again.
 */
function GatedTabPanel({ tab, reason, weekend, onGoToTower }) {
  const nextStart = reason === 'awaiting_grid'
    ? weekend?.nextSession?.start ?? null
    : weekend?.nextSession?.start ?? null
  const seconds = useCountdownSeconds(nextStart)

  return (
    <div
      className="flex-1 overflow-y-auto flex items-start justify-center p-8"
      data-gated-tab={tab}
      data-gate-reason={reason ?? 'none'}
    >
      <div className="flex flex-col items-center gap-3 text-center max-w-md">
        <div className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--pw-ghost)' }}>
          {tab} · no data this phase
        </div>
        <div className="font-mono text-xs leading-relaxed" style={{ color: 'var(--pw-dim)' }}>
          {disabledTabMessage(reason, { nextSession: weekend?.nextSession })}
        </div>
        {seconds !== null && weekend?.nextSession && (
          <div className="flex flex-col items-center gap-0.5 mt-1">
            <span className="font-mono text-[9px] tracking-widest uppercase" style={{ color: 'var(--pw-ghost)' }}>
              {weekend.nextSession.label} in
            </span>
            <span className="font-mono text-lg font-bold tabular-nums" style={{ color: 'var(--pw-text-strong)' }}>
              {formatCountdown(seconds)}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onGoToTower}
          className="font-display text-[10px] tracking-widest uppercase px-3 py-1.5 border rounded-sm mt-2 transition-colors"
          style={{ borderColor: 'var(--pw-border)', color: 'var(--pw-dim)' }}
        >
          {reason === 'awaiting_grid' ? 'View starting grid' : 'View schedule'}
        </button>
      </div>
    </div>
  )
}

const TABS = LIVE_TABS

// ── Live page ─────────────────────────────────────────────────────────────────
export default function Live() {
  const [activeTab, setActiveTab]           = useState('TOWER')
  const [expandedDriver, setExpandedDriver] = useState(null)
  const [showSidebar, setShowSidebar]       = useState(true)
  const splitRef = useRef(null)
  const [preRaceView, setPreRaceView]       = useState('GRID') // 'GRID' | 'COUNTDOWN'

  // Expose setActiveTab to window so keyboard shortcuts can switch tabs
  useEffect(() => {
    window.__pitwall_setTab = (tab) => {
      const normalized = tab.toUpperCase()
      if (TABS.includes(normalized)) setActiveTab(normalized)
    }
    return () => { delete window.__pitwall_setTab }
  }, [])

  const session     = useF1Store((s) => s.session)
  const trackStatus = useF1Store((s) => s.trackStatus)
  const drivers     = useF1Store((s) => s.drivers)
  const timing      = useF1Store((s) => s.timing)
  const tyres       = useF1Store((s) => s.tyres)
  const weather     = useF1Store((s) => s.weather)
  const settings    = useF1Store((s) => s.settings)
  const raceControl = useF1Store((s) => s.raceControl)
  const qualifying  = useF1Store((s) => s.qualifying)

  const replay = useF1Store((s) => s.replay)
  const replayCatalogue = useReplayCatalogue()

  const weekendState = useRaceWeekendState()
  const storeResults = useF1Store((s) => s.results)
  const setResults   = useF1Store((s) => s.setResults)

  // While waiting on a classification, poll for it. Without this the Live page
  // would sit on "awaiting official results" indefinitely: nothing else fetches
  // that round, so the lifecycle could never learn the results had landed and
  // move on. Jolpica publishes minutes to hours after the flag.
  const pendingRound = weekendState.mode === 'RESULTS_PENDING'
    ? weekendState.currentRace?.round ?? null
    : null

  useEffect(() => {
    if (pendingRound == null) return
    const existing = storeResults[pendingRound]
    if (existing && !existing.pending && !existing.empty) return

    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(`https://api.jolpi.ca/ergast/f1/2026/${pendingRound}/results.json`)
        if (!res.ok) return
        const json = await res.json()
        const race = json?.MRData?.RaceTable?.Races?.[0]
        if (!cancelled && race?.Results?.length) setResults(pendingRound, race)
      } catch { /* transient — the interval will try again */ }
    }
    check()
    const id = setInterval(check, 3 * 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRound])

  // The weekend layer: which GP owns this tab, which phase it is in, which
  // sub-tabs may render, and what the tower should be showing. Null outside a
  // weekend window, in which case the page keeps its pre-Phase-E behaviour.
  const weekend = weekendState.weekend ?? null
  const towerContent = weekend?.towerContent ?? null
  const tabs = weekend?.tabs ?? null
  const gateReason = tabs?.reason ?? null

  // `isLive` means timing is still changing. The provisional window also
  // renders the tower but is NOT live, so the two must not be conflated.
  const isLive        = weekendState.isLive === true
  const isProvisional = weekendState.provisional === true
  // A replay drives the tower through exactly the same envelopes a live
  // session does, so the tower shows for both. The distinction a viewer needs
  // is made by the REPLAY bar and the header badge, not by hiding the data.
  const showsTower    = weekendState.mode === 'SESSION_LIVE' || replay.active
  const resultsPending = weekendState.mode === 'RESULTS_PENDING'
  const currentRound = weekendState.currentRace?.round
  const { grid: qualifyingGrid, raceInfo: qualiRaceInfo, loading: qualiLoading } = useQualifyingGrid(currentRound)

  // Live tyre/stint data comes from the SignalR TimingAppData feed, which is
  // authoritative during a session, so we deliberately don't fetch OpenF1
  // stints while live. OpenF1 is free (verified 2026-10-11) and is the right
  // source for post-session stint analysis — a Tier 2 task.
  const { stints: openf1Stints } = useOpenF1Stints(null)
  const { reachable: openf1Reachable, checked: openf1Checked } = useOpenF1Status()

  // Memoised derived data.
  //
  // Position is authoritative in both modes — in qualifying F1 already orders
  // Position by best lap. Best lap is used only as a tie-break for the window
  // where several drivers still share position 0 before the feed has ordered
  // them, and drivers with no lap set sort last (as real F1 shows them).
  const sortedTiming = useMemo(() => {
    const isQ = /QUALIFYING|SHOOTOUT/.test((session.name ?? '').toUpperCase())
    return [...timing].sort((a, b) => {
      const pa = parseInt(a.position ?? 99, 10) || 99
      const pb = parseInt(b.position ?? 99, 10) || 99
      if (pa !== pb) return pa - pb
      if (!isQ) return 0
      const ba = a.best_lap_time_in_s ?? Infinity
      const bb = b.best_lap_time_in_s ?? Infinity
      return ba - bb
    })
  }, [timing, session.name])

  // tyresByDriver: merge SignalR tyre data with OpenF1 stint data
  const tyresByDriver = useMemo(() => {
    // Build base from SignalR
    const base = Object.fromEntries(tyres.map((t) => [t.driver_number ?? t.number, t]))

    // Enrich with OpenF1 stints (most recent stint per driver)
    if (openf1Stints.length > 0) {
      const latestStint = {}
      for (const s of openf1Stints) {
        const num = s.driver_number
        if (!latestStint[num] || s.stint_number > latestStint[num].stint_number) {
          latestStint[num] = s
        }
      }
      for (const [num, stint] of Object.entries(latestStint)) {
        const existing = base[num] ?? {}
        // OpenF1 compound names: SOFT, MEDIUM, HARD, INTERMEDIATE, WET
        base[num] = {
          ...existing,
          compound: stint.compound ?? existing.compound,
          // age = current lap (from session) minus lap_start of stint
          age: stint.lap_end != null
            ? (stint.lap_end - (stint.lap_start ?? 1) + 1)
            : existing.age,
          is_new: stint.stint_number === 1,
        }
      }
    }
    return base
  }, [tyres, openf1Stints])

  const driversByNumber = useMemo(
    () => Object.fromEntries(drivers.map((d) => [d.number, d])),
    [drivers]
  )

  const handleExpand = useCallback(
    (driverNum) => setExpandedDriver((prev) => prev === driverNum ? null : driverNum),
    []
  )

  const penaltiesByDriver = useMemo(() => {
    const map = {}
    const seenMessages = new Set()

    for (let i = raceControl.length - 1; i >= 0; i--) {
      const msg = raceControl[i]
      const txt = msg.message || ''
      const upper = txt.toUpperCase()

      // Skip non-penalty steward messages
      if (upper.includes('NO FURTHER ACTION') || (upper.includes('INVESTIGATION') && !upper.includes('PENALTY'))) {
        continue
      }
      if (upper.includes('TRACK LIMITS') && !upper.includes('PENALTY')) {
        continue
      }

      const isTimePen = upper.includes('TIME PENALTY') || upper.includes('SECOND PENALTY') || /\d+\s*SEC(?:OND)?\s*TIME\s*PENALTY/.test(upper)
      const isDriveThrough = upper.includes('DRIVE THROUGH') || upper.includes('DRIVE-THROUGH')
      const isStopGo = upper.includes('STOP AND GO') || upper.includes('STOP/GO') || upper.includes('STOP & GO')
      const isDSQ = upper.includes('DISQUALIFIED')
      const isGeneralPenalty = upper.includes('PENALTY')

      if (isTimePen || isDriveThrough || isStopGo || isDSQ || isGeneralPenalty) {
        let drvNum = msg.driver_number != null ? String(msg.driver_number) : null
        if (!drvNum) {
          const m = upper.match(/CAR(?:S)?\s+(\d+)/i)
          if (m) drvNum = m[1]
        }

        if (drvNum) {
          const msgKey = `${drvNum}_${txt.trim()}`
          if (seenMessages.has(msgKey)) continue
          seenMessages.add(msgKey)

          let label = 'PEN'
          let duration = null

          const secMatch = upper.match(/(\d+)\s*(?:SECOND|SEC)\b/i)
          if (secMatch) {
            duration = parseInt(secMatch[1], 10)
            const prevDuration = map[drvNum]?.duration ?? 0
            const totalDuration = prevDuration + duration
            label = `+${totalDuration}s`
            map[drvNum] = {
              label,
              duration: totalDuration,
              message: map[drvNum] ? `${map[drvNum].message} | ${txt}` : txt,
              lap: msg.lap,
            }
          } else if (isDriveThrough) {
            label = 'DT'
            map[drvNum] = { label, duration: null, message: txt, lap: msg.lap }
          } else if (isStopGo) {
            label = 'SG'
            map[drvNum] = { label, duration: null, message: txt, lap: msg.lap }
          } else if (isDSQ) {
            label = 'DSQ'
            map[drvNum] = { label, duration: null, message: txt, lap: msg.lap }
          } else if (!map[drvNum]) {
            map[drvNum] = { label: 'PEN', duration: null, message: txt, lap: msg.lap }
          }
        }
      }
    }
    return map
  }, [raceControl])

  const sessionName = session.name ?? ''

  // ── Qualifying detection ────────────────────────────────────────────────────
  // The session TYPE comes from its name ("Qualifying" / "Sprint Qualifying"),
  // but the SEGMENT cannot: F1 names the session "Qualifying" for all three
  // parts, so `sessionName.includes('Q2')` was never true and the tower drew
  // the Q1 cut line for the entire hour. The segment comes from
  // TimingData.SessionPart (or SessionData.Series[].QualifyingPart), both now
  // routed into store.qualifying.
  const isQualifyingSession = isQualifyingSessionName(sessionName)
  const qualiPart = qualifying.part ?? null
  const towerMode = isQualifyingSession ? 'QUALI' : 'RACE'
  const towerColumns = getTowerColumns(towerMode)
  const towerMin = towerMinWidth(towerColumns)

  // Drag-to-resize. The tower minimum is passed in so the sidebar can never be
  // widened to the point where the tower's columns no longer fit.
  const sidebar = useResizableSidebar({
    containerRef: splitRef,
    towerMinWidth: towerMin,
    enabled: showSidebar,
  })

  // Cut maths lives in utils/qualifyingUtils (pure + tested) because an
  // off-by-one here tells viewers the wrong drivers are being eliminated.
  const { cutIndex, eliminatedFrom } = isQualifyingSession
    ? getQualifyingCut(qualiPart, qualifying.noEntries)
    : { cutIndex: null, eliminatedFrom: null }

  const currentLap = session.lap ?? sortedTiming[0]?.lap ?? (sortedTiming.length > 0 ? 1 : null)
  // No invented fallback: circuitData.laps is null for circuits we have no
  // verified lap count for (e.g. Madring), and `?? 56` would present a guess
  // as fact. null renders as an em dash.
  const totalLaps = session.total_laps ?? weekendState.circuitData?.laps ?? null
  const isRaceStarted = Boolean(currentLap && currentLap >= 1)

  const recentProcedureMsg = !isRaceStarted && raceControl.length > 0
    ? raceControl.find((m) => {
        const txt = (m.message || m.msg || '').toUpperCase()
        return (
          txt.includes('FORMATION LAP') ||
          txt.includes('START PROCEDURE') ||
          txt.includes('STARTING PROCEDURE') ||
          txt.includes('START ORDER') ||
          txt.includes('RACE START')
        )
      })
    : null

  const procTxt = (recentProcedureMsg?.message || recentProcedureMsg?.msg || '').toUpperCase()
  const isSuspended = !isRaceStarted && (procTxt.includes('SUSPEND') || procTxt.includes('DELAY'))
  const isFormationLap = !isRaceStarted && !isSuspended && (procTxt.includes('FORMATION LAP') || procTxt.includes('BEHIND SAFETY CAR'))
  // Whether the tower is the right surface right now. Driven by the resolved
  // lifecycle, not by "do we happen to have timing rows" — retained rows
  // outlive the session and used to keep this true indefinitely.
  const isSessionActive = showsTower && (sortedTiming.length > 0 || isSuspended || isFormationLap)



  // Qualifying order is not the grid. Penalties move drivers between the
  // chequered flag and lights out, and this page sits on that phase for hours,
  // so the grid is rebuilt from race control every time a message arrives
  // rather than being rendered once from the qualifying classification.
  //
  // An official grid, once the results feed carries one, outranks anything we
  // derive — see utils/startingGrid.
  const officialGrid = useMemo(() => {
    const rows = storeResults[currentRound]?.Results
    if (!Array.isArray(rows)) return null
    return rows
      .filter((r) => r?.grid != null)
      .map((r) => ({ number: String(r.number), grid: Number(r.grid) }))
  }, [storeResults, currentRound])

  const startingGrid = useMemo(
    () => buildStartingGrid({ qualifying: qualifyingGrid, raceControl, officialGrid }),
    [qualifyingGrid, raceControl, officialGrid],
  )

  // A starting grid belongs to the grid phase and nowhere else.
  //
  // It describes a race that has not happened yet, so it must not appear once
  // the race has run or while we wait on its classification — that presents a
  // finished Grand Prix as upcoming. It equally must not appear during a gap
  // between practice sessions, or before anything has run, where it would be
  // either premature or last weekend's grid. The weekend layer already answers
  // "is this the grid phase"; when there is no weekend (out of season) the page
  // keeps its previous behaviour.
  const gridIsThePoint = towerContent == null || towerContent === TowerContent.STARTING_GRID
  const showStartingGrid = startingGrid.rows.length > 0
    && preRaceView === 'GRID'
    && !resultsPending
    && !isRaceStarted
    && session.phase !== 'FINISHED'
    && gridIsThePoint

  const sessionHeaderTitle = isSuspended
    ? 'START PROCEDURE SUSPENDED'
    : isFormationLap
    ? 'FORMATION LAP'
    : isProvisional
    ? `${session.name ? session.name.toUpperCase() : 'SESSION'} — PROVISIONAL`
    : isSessionActive
    ? (session.name ? session.name.toUpperCase() : 'RACE')
    // Inside a weekend window the subject is THAT Grand Prix. The legacy layer
    // advances currentRace to the next one the moment a race finishes, which
    // titled the Monday-after tower with a race five days away.
    : weekend?.race?.raceName
      ?? weekendState.currentRace?.raceName
      ?? 'NO SESSION'

  // Qualifying shows the live segment instead of a lap count — there are no
  // laps to count down in a knockout session.
  const qualiHeaderLabel = isQualifyingSession
    ? qualifyingHeaderLabel(qualiPart, qualifying.noEntries)
    : null

  const sessionHeaderRight = isSuspended
    ? (raceControl[0]?.message?.toUpperCase()?.includes('START ORDER') ? 'ORIGINAL GRID' : 'START SUSPENDED')
    : isFormationLap
    ? 'BEHIND SAFETY CAR'
    : isProvisional
    ? 'CLASSIFICATION — UNOFFICIAL'
    : isSessionActive
    ? (qualiHeaderLabel ?? `LAP ${currentLap ?? '—'} / ${totalLaps ?? '—'}`)
    // Before lights out there is no lap 0 — the race hasn't started. Showing
    // "LAP 0 / 53" here was the second source of the phantom lap counter.
    : weekendState.mode === 'WEEKEND_BETWEEN_SESSIONS' || weekendState.mode === 'WEEKEND_SESSION_SOON' || weekendState.mode === 'SESSION_LIVE'
    ? `${totalLaps ?? '—'} LAPS`
    : weekendState.nextSession?.label ?? 'UPCOMING'


  return (
    <div
      className="h-full flex flex-col"
      style={{ background: 'var(--pw-bg)' }}
      /* The resolved weekend phase, surfaced for scripts/verify-weekend-phases
         to read. Four of the five phases depend on the wall clock and cannot be
         reached by hand, so the verifier asserts on this rather than guessing
         the phase from pixels. */
      data-weekend-state={weekend?.state ?? 'NONE'}
      data-tower-content={towerContent ?? 'NONE'}
    >

      {/* Replay transport. Above the sub-tabs, because a viewer must never be
          in doubt about whether what they are looking at is live. */}
      <ReplayBar sessions={replayCatalogue.weekends?.[0]?.sessions ?? []} />

      {/* Sub-tab bar — role=tablist with arrow key navigation */}
      <div
        role="tablist"
        aria-label="Live dashboard views"
        className="flex border-b border-pitwall-border"
        style={{ background: 'var(--pw-surface)' }}
        onKeyDown={(e) => {
          const idx = TABS.indexOf(activeTab)
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            setActiveTab(TABS[(idx + 1) % TABS.length])
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault()
            setActiveTab(TABS[(idx - 1 + TABS.length) % TABS.length])
          }
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            id={`${tab.toLowerCase()}-tab`}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`${tab.toLowerCase()}-panel`}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setActiveTab(tab)}
            className={`px-4 md:px-5 py-2 font-display text-xs tracking-widest uppercase transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-status-red'
                : 'border-b-2 border-transparent'
            }`}
            style={{ color: activeTab === tab ? 'var(--pw-text-strong)' : 'var(--pw-ghost)' }}
          >
            {tab}
            {tabs && tabs[tab] === false && (
              <span
                className="ml-1.5 inline-block w-1 h-1 rounded-full align-middle"
                style={{ background: 'var(--pw-ghost)', opacity: 0.7 }}
                title="No data for this phase of the weekend"
                aria-hidden="true"
              />
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 px-4">
          {/* OpenF1 reachability — live probe, not a hardcoded value */}
          <div
            className="flex items-center gap-1"
            title={
              !openf1Checked
                ? 'Checking OpenF1 reachability…'
                : openf1Reachable
                ? 'OpenF1 reachable — used for post-session, replay and reference data'
                : 'OpenF1 unreachable — live timing still served by F1 SignalR'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                !openf1Checked ? 'bg-pitwall-ghost' : openf1Reachable ? 'bg-status-green' : 'bg-pitwall-ghost'
              }`}
              style={{ opacity: openf1Reachable ? 1 : 0.4 }}
              aria-hidden="true"
            />
            <span
              className="font-mono text-[10px]"
              style={{ color: 'var(--pw-ghost)', opacity: openf1Reachable ? 0.9 : 0.4 }}
            >
              OF1
            </span>
          </div>
          <span className="font-mono text-xs" style={{ color: 'var(--pw-dim)' }}>{session.clock ?? '—'}</span>
        </div>
      </div>

      {/* Track status banner */}
      <TrackStatusBanner statusCode={trackStatus.status} />

      {/* The session is over but these are the retained timing rows, not a live
          feed. Say so plainly — this is the window the old code spent showing a
          finished race as live. */}
      {isProvisional && (
        <div
          role="status"
          className="flex items-center gap-2 px-4 py-1.5 border-b border-amber-500/40 bg-amber-500/10"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" aria-hidden="true" />
          <span className="font-display text-[10px] font-bold tracking-widest uppercase text-amber-700 dark:text-amber-400">
            {sessionStateLabel(SessionState.PROVISIONAL)}
          </span>
          <span className="font-mono text-[10px] text-pitwall-dim">
            Session finished — showing the final timing state. Not live, and not yet official.
          </span>
        </div>
      )}

      {/* ── TOWER TAB ─────────────────────────────────────────────── */}
      {activeTab === 'TOWER' && (
        <div ref={splitRef} className="flex-1 flex flex-col lg:flex-row overflow-hidden">

          {/* Timing tower — full width on md, dynamically expands if sidebar is hidden */}
          <SpotlightPanel 
            className="flex flex-col border-b lg:border-b-0 border-pitwall-border overflow-hidden w-full lg:flex-1"
            style={{ minWidth: 0 }}
          >

            {/* Session header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-pitwall-border"
              style={{ background: 'var(--pw-surface)' }}>
              <div className="flex items-center gap-2">
                <span className="font-display font-semibold text-sm tracking-wider uppercase"
                  style={{ color: 'var(--pw-text)' }}>
                  {!isSessionActive && showStartingGrid
                    ? startingGrid.label
                    : sessionHeaderTitle}
                </span>
                {isQualifyingSession && qualiPart != null ? (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-status-red/15 text-status-red border border-status-red/40">
                    Q{qualiPart}
                  </span>
                ) : null}
                {isFormationLap ? (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/40 animate-pulse">
                    FORMATION LAP
                  </span>
                ) : !isSessionActive && showStartingGrid ? (
                  <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-status-green/15 text-status-green border border-status-green/30">
                    QUALI COMPLETE
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2.5">
                {!isSessionActive && gridIsThePoint && (showStartingGrid || (startingGrid.rows.length > 0 && !resultsPending && !isRaceStarted)) && (
                  <div className="flex items-center bg-pitwall-surface-2 p-0.5 rounded border border-pitwall-border">
                    <button
                      onClick={() => setPreRaceView('GRID')}
                      className={`px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded transition-colors ${
                        preRaceView === 'GRID' ? 'bg-pitwall-muted/80 text-pitwall-text-strong font-bold shadow-sm' : 'text-pitwall-ghost hover:text-pitwall-text-strong'
                      }`}
                    >
                      🏁 GRID ({startingGrid.rows.length})
                    </button>
                    <button
                      onClick={() => setPreRaceView('COUNTDOWN')}
                      className={`px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded transition-colors ${
                        preRaceView === 'COUNTDOWN' ? 'bg-pitwall-muted/80 text-pitwall-text-strong font-bold shadow-sm' : 'text-pitwall-ghost hover:text-pitwall-text-strong'
                      }`}
                    >
                      ⏱️ COUNTDOWN
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setShowSidebar(!showSidebar)}
                  className="font-display text-[9px] tracking-widest px-2.5 py-1 border border-pitwall-border hover:border-pitwall-muted text-pitwall-ghost hover:text-pitwall-dim rounded-sm transition-all uppercase font-bold bg-white/5 active:scale-95 select-none"
                  title={showSidebar ? "Hide sidebar map and weather" : "Show sidebar map and weather"}
                >
                  {showSidebar ? "◀ HIDE SIDEBAR" : "▶ SHOW SIDEBAR"}
                </button>
                <span className="font-mono text-xs" style={{ color: 'var(--pw-dim)' }}>
                  {sessionHeaderRight}
                </span>
              </div>
            </div>

            {/* Timing table container — synchronized horizontal and vertical scroll */}
            <div className="flex-1 flex flex-col overflow-y-auto overflow-x-auto">
              <div className="w-full flex flex-col flex-1" style={{ minWidth: towerMinWidth(towerColumns) }}>
                {/* Column headers for active live race */}
                {isSessionActive && sortedTiming.length > 0 && (
                  <div className="sticky top-0 z-10 w-full bg-pitwall-surface-2 border-b border-pitwall-border px-4">
                    {/* Same column list DriverRow iterates — header and rows
                        are aligned by construction, not by matching numbers. */}
                    <div
                      className="grid items-center h-7 w-full"
                      style={{ gridTemplateColumns: towerGridTemplate(towerColumns) }}
                      role="row"
                    >
                      {towerColumns.map((col) => (
                        <div
                          key={col.key}
                          role="columnheader"
                          className="font-mono text-[10px] text-pitwall-ghost tracking-widest tabular-nums"
                          style={{ textAlign: col.align }}
                        >
                          {col.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Driver rows / starting grid / skeleton / smart empty state */}
                <div className={`flex-1 ${(!isSessionActive && showStartingGrid) ? 'px-0 py-0' : 'px-4 py-2'}`}>
                  {(!isSessionActive || sortedTiming.length === 0) ? (
                    showStartingGrid ? (
                      <QualifyingGridTower
                        grid={startingGrid.rows}
                        raceInfo={qualiRaceInfo}
                        loading={qualiLoading}
                        source={startingGrid.source}
                        penaltyCount={startingGrid.penaltyCount}
                      />
                    ) : towerContent === TowerContent.SCHEDULE && weekend ? (
                      <PreWeekendCard weekend={weekend} />
                    ) : weekend?.state === WeekendState.GAP_IDLE ? (
                      <GapIdleCard weekend={weekend} />
                    ) : weekend?.state === WeekendState.POST_WEEKEND ? (
                      <PostWeekendCard
                        weekend={weekend}
                        classification={storeResults[weekend.race?.round]?.Results}
                        nextRace={weekendState.currentRace}
                        nextSessionDt={weekendState.nextSession?.targetDt}
                      />
                    ) : isLive && !qualifyingGrid.length ? (
                      <div>
                        {Array.from({ length: 20 }).map((_, i) => <SkeletonDriverRow key={i} />)}
                      </div>
                    ) : replay.active ? (
                      /* A replay before the first car crosses the line is not
                         "no session active" — the session is very much on, it
                         is lap one. Saying the wrong thing here is the same
                         mistake as showing stale timing, in the other
                         direction. */
                      <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
                        <span className="text-3xl" role="img" aria-hidden="true">🏁</span>
                        <div className="font-display text-sm font-bold tracking-widest uppercase"
                          style={{ color: 'var(--pw-text-strong)' }}>
                          Lap one
                        </div>
                        <div className="font-mono text-[11px] max-w-xs leading-relaxed"
                          style={{ color: 'var(--pw-dim)' }}>
                          Nobody has completed a lap yet, so there is nothing on the timing
                          screen. It fills as the cars cross the line.
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-2">
                        <TowerEmptyState weekendState={weekendState} />
                        {/* Not an apology for the live feed. On the public
                            deployment F1 refuses the server's network, so this
                            is the only way any of these four tabs can show
                            anything — and it is a real Grand Prix. */}
                        <ReplayLauncher />
                      </div>
                    )
                  ) : (
                    sortedTiming.map((t, index) => {
                      const driverNum  = t?.driver_number ?? t?.number
                      const driver     = driversByNumber[driverNum] ?? { number: driverNum }
                      const tyre       = tyresByDriver[driverNum]
                      const teamColour = getTeamColour(driverNum, drivers, 'accent')
                      const teamTextColour = getTeamColour(driverNum, drivers, 'text')
                      const isFav      = settings.favouriteDrivers?.includes(String(driverNum))
                      const penalty    = penaltiesByDriver[String(driverNum)]

                      const prevT = index > 0 ? sortedTiming[index - 1] : null
                      const currentGapSecs = parseGapToSeconds(t?.gap_to_leader ?? t?.gap)
                      const aheadGapSecs = prevT ? parseGapToSeconds(prevT.gap_to_leader ?? prevT.gap) : 0
                      const gapToAhead = currentGapSecs != null && aheadGapSecs != null ? currentGapSecs - aheadGapSecs : null
                      const isBattling = index > 0 && gapToAhead != null && gapToAhead < 1.0

                      const showCutLine = cutIndex != null && index === cutIndex

                      return (
                        <div key={driverNum ?? index}>
                          <DriverRow
                            driver={driver}
                            timing={t}
                            tyre={tyre}
                            teamColour={teamColour}
                            teamTextColour={teamTextColour}
                            isFavourite={isFav}
                            expanded={expandedDriver === driverNum}
                            onExpand={() => handleExpand(driverNum)}
                            isBattling={isBattling}
                            showSidebar={showSidebar}
                            penalty={penalty}
                            mode={towerMode}
                          />
                          {showCutLine && (
                            <div className="flex items-center gap-2 px-4 py-1 bg-pitwall-surface-2">
                              <div className="flex-1 h-px bg-status-red/50" />
                              <span className="font-mono text-[10px] text-status-red tracking-widest font-bold">
                                Q{qualiPart} CUT · P{eliminatedFrom}+ ELIMINATED
                              </span>
                              <div className="flex-1 h-px bg-status-red/50" />
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </SpotlightPanel>

          {/* Right panel — track map + weather/schedule */}
          {showSidebar && (
            <>
            {/* Drag handle on the sidebar's inner edge. role=separator with
                aria-valuenow is the standard pattern for a resizable split, and
                it is focusable so the layout can be adjusted without a mouse. */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              aria-valuenow={sidebar.width}
              aria-valuemin={SIDEBAR.min}
              aria-valuemax={SIDEBAR.max}
              tabIndex={0}
              onPointerDown={sidebar.onPointerDown}
              onKeyDown={sidebar.onKeyDown}
              onDoubleClick={() => sidebar.onKeyDown({ key: 'Home', preventDefault() {} })}
              title="Drag to resize · double-click to reset · arrow keys when focused"
              className={`hidden lg:flex items-center justify-center flex-shrink-0 cursor-col-resize group border-l border-pitwall-border transition-colors ${
                sidebar.dragging ? 'bg-status-red/30' : 'hover:bg-status-red/20'
              }`}
              style={{ width: SIDEBAR.handle }}
            >
              <span
                className={`w-[2px] h-8 rounded-full transition-colors ${
                  sidebar.dragging ? 'bg-status-red' : 'bg-pitwall-border group-hover:bg-status-red/60'
                }`}
                aria-hidden="true"
              />
            </div>
            <div
              className="hidden lg:flex flex-col overflow-hidden flex-shrink-0"
              style={{ width: sidebar.width }}
            >
              <div className="flex-1 border-b border-pitwall-border overflow-hidden"
                style={{ background: 'var(--pw-surface)' }}>
                <div className="px-4 py-2 border-b border-pitwall-border">
                  <span className="font-mono text-[10px] tracking-widest uppercase"
                    style={{ color: 'var(--pw-ghost)' }}>
                    {showsTower ? 'Track Map' : 'Circuit'}
                  </span>
                </div>
                <div className="p-3 overflow-y-auto h-full">
                  {showsTower ? (
                    /* Running or provisional — map + weather + race control */
                    <div className="flex flex-col gap-3">
                      <TrackMap circuitData={weekendState.circuitData} compact showStats={false} />
                      <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase mb-2">Weather</div>
                      {weather ? (
                        <>
                          <div className="grid grid-cols-3 gap-3">
                            <WeatherTile label="Track Temp" value={`${weather.track_temp ?? '—'}°C`} />
                            <WeatherTile label="Air Temp"   value={`${weather.air_temp ?? '—'}°C`} />
                            <WeatherTile label="Humidity"   value={`${weather.humidity ?? '—'}%`} />
                            <WeatherTile label="Conditions" value={weather.rainfall ? 'WET' : 'DRY'} accent={!weather.rainfall} />
                          </div>
                          <div className="font-mono text-xs text-pitwall-dim">
                            Wind: {weather.wind_speed ?? '—'} km/h{weather.wind_direction ? ` · ${weather.wind_direction}°` : ''}
                          </div>
                        </>
                      ) : (
                        <div className="font-mono text-xs text-pitwall-ghost">Weather data not available</div>
                      )}

                      {/* Race Control Messages */}
                      <div className="border-t border-pitwall-border/40 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase">Race Control</span>
                          <span className="font-mono text-[9px] text-pitwall-ghost">{raceControl?.length ?? 0} MSGS</span>
                        </div>
                        <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
                          {(!raceControl || raceControl.length === 0) ? (
                            <div className="font-mono text-xs text-pitwall-ghost py-2 text-center">No messages yet</div>
                          ) : (
                            raceControl.slice(0, 10).map((msg, i) => {
                              const isRed    = msg.flag === 'RED' || msg.category === 'SafetyCar'
                              const isSC     = msg.flag === 'SC' || msg.flag === 'VSC'
                              const isDrv    = msg.scope === 'Driver'
                              const dotCls   = isRed ? 'bg-red-500' : isSC ? 'bg-yellow-400' : isDrv ? 'bg-orange-400' : 'bg-pitwall-ghost'
                              const rowBgCls = isRed ? 'bg-red-950/30 border-red-900/40' : isSC ? 'bg-yellow-950/20 border-yellow-900/30' : isDrv ? 'bg-orange-950/15 border-orange-900/20' : 'border-pitwall-border/40'
                              return (
                                <div key={i} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-sm border ${rowBgCls}`}>
                                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls}`} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      {msg.lap && <span className="font-mono text-[9px] text-pitwall-ghost">L{msg.lap}</span>}
                                      <span className={`font-display font-bold text-[9px] uppercase ${
                                        isRed ? 'text-red-400' : isSC ? 'text-yellow-400' : isDrv ? 'text-orange-300' : 'text-pitwall-dim'
                                      }`}>{msg.category || 'INFO'}</span>
                                    </div>
                                    <p className="font-mono text-[9.5px] text-pitwall-text-strong leading-tight break-words">{msg.message}</p>
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Pre-session — smart weekend panel */
                    <WeekendPanel weekendState={weekendState} weather={weather} />
                  )}
                </div>
              </div>
            </div>
            </>
          )}
        </div>
      )}

      {/* ── OTHER TABS ────────────────────────────────────────────── */}
      {/* Strategy, telemetry and radio are session data. Between qualifying and
          the race — and before FP1 — there is none, and rendering the last
          session's is the specific failure this gate exists to prevent: it
          looks live. The nav stays enabled; the panel explains itself. */}
      {activeTab === 'STRATEGY' && (
        tabs && !tabs.STRATEGY
          ? <GatedTabPanel tab="Strategy" reason={gateReason} weekend={weekend} onGoToTower={() => setActiveTab('TOWER')} />
          : <div className="flex-1 overflow-hidden"><StrategyTab /></div>
      )}
      {activeTab === 'TELEMETRY' && (
        tabs && !tabs.TELEMETRY
          ? <GatedTabPanel tab="Telemetry" reason={gateReason} weekend={weekend} onGoToTower={() => setActiveTab('TOWER')} />
          : <div className="flex-1 overflow-hidden"><TelemetryTab /></div>
      )}
      {activeTab === 'RADIO' && (
        tabs && !tabs.RADIO
          ? <GatedTabPanel tab="Radio" reason={gateReason} weekend={weekend} onGoToTower={() => setActiveTab('TOWER')} />
          : <div className="flex-1 overflow-hidden"><RadioTab /></div>
      )}

      {/* Live Broadcast Event Banner Ticker */}
      <BroadcastBanner />
    </div>
  )
}
