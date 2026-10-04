import { useState, useMemo, useCallback, useEffect } from 'react'
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
            <div className="grid grid-cols-2 gap-2 mb-2">
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
  const headerLabel = isWeekend ? 'RACE WEEKEND IN PROGRESS' : mode === 'WEEKEND_UPCOMING' ? 'UPCOMING RACE' : 'UPCOMING RACE'

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

const TABS = ['TOWER', 'STRATEGY', 'TELEMETRY', 'RADIO']

// ── Live page ─────────────────────────────────────────────────────────────────
export default function Live() {
  const [activeTab, setActiveTab]           = useState('TOWER')
  const [expandedDriver, setExpandedDriver] = useState(null)
  const [showSidebar, setShowSidebar]       = useState(true)
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

  const weekendState = useRaceWeekendState()
  const isLive = weekendState.mode === 'SESSION_LIVE'
  const currentRound = weekendState.currentRace?.round
  const { grid: qualifyingGrid, raceInfo: qualiRaceInfo, loading: qualiLoading } = useQualifyingGrid(currentRound)

  // OpenF1 stints — NOTE: OpenF1 now requires paid subscription (returns 401).
  // Stints data during live sessions comes from the SignalR tyre feed instead.
  // When OpenF1 free tier returns, this will work for post-session analysis.
  const { stints: openf1Stints } = useOpenF1Stints(null)  // disabled
  const { reachable: openf1Reachable } = useOpenF1Status() // always false

  // Memoised derived data
  const sortedTiming = useMemo(() =>
    [...timing].sort((a, b) => {
      const pa = parseInt(a.position ?? 99, 10)
      const pb = parseInt(b.position ?? 99, 10)
      return pa - pb
    }),
    [timing]
  )

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
  const isQ  = sessionName.toUpperCase().includes('QUALIFYING') || sessionName.includes('Q1')
  const isQ2 = sessionName.includes('Q2') || sessionName.includes('Q3')
  const isQ3 = sessionName.includes('Q3')
  const q1Cut = 15, q2Cut = 10

  const colWidths = {
    pos: 'w-[6%] min-w-[28px]',
    drv: 'w-[13%] min-w-[66px] pl-1',
    gap: 'w-[13%] min-w-[62px]',
    lastLap: 'w-[14%] min-w-[70px]',
    s1: 'w-[11%] min-w-[52px] text-center',
    s2: 'w-[11%] min-w-[52px] text-center',
    s3: 'w-[11%] min-w-[52px] text-center',
    tyre: 'w-[8%] min-w-[36px] text-center',
    pit: 'w-[5%] min-w-[22px] text-center',
  }

  const recentProcedureMsg = raceControl.find((m) => {
    const txt = (m.message || m.msg || '').toUpperCase()
    return (
      txt.includes('FORMATION LAP') ||
      txt.includes('START PROCEDURE') ||
      txt.includes('STARTING PROCEDURE') ||
      txt.includes('START ORDER') ||
      txt.includes('RACE START')
    )
  })

  const procTxt = (recentProcedureMsg?.message || recentProcedureMsg?.msg || '').toUpperCase()
  const isSuspended = procTxt.includes('SUSPEND') || procTxt.includes('DELAY')
  const isFormationLap = !isSuspended && (procTxt.includes('FORMATION LAP') || procTxt.includes('BEHIND SAFETY CAR'))
  const isSessionActive = isSuspended || isFormationLap || ['LIVE', 'RACE', 'QUALIFYING', 'PRACTICE', 'FORMATION'].includes(session.phase) || (session.phase !== 'PRE' && (isLive || sortedTiming.length > 0)) || (sortedTiming.length > 0 && (isLive || isFormationLap || isSuspended))

  const sessionHeaderTitle = isSuspended
    ? 'START PROCEDURE SUSPENDED'
    : isFormationLap
    ? 'FORMATION LAP'
    : isSessionActive
    ? (session.name ? session.name.toUpperCase() : 'RACE')
    : weekendState.currentRace?.raceName ?? 'NO SESSION'

  const sessionHeaderRight = isSuspended
    ? (raceControl[0]?.message?.toUpperCase()?.includes('START ORDER') ? 'ORIGINAL GRID' : 'START SUSPENDED')
    : isFormationLap
    ? 'BEHIND SAFETY CAR'
    : isSessionActive
    ? `LAP ${currentLap ?? '—'} / ${totalLaps ?? '—'}`
    : weekendState.mode === 'WEEKEND_BETWEEN_SESSIONS' || weekendState.mode === 'WEEKEND_SESSION_SOON' || weekendState.mode === 'SESSION_LIVE'
    ? `LAP 0 / ${totalLaps ?? '—'}`
    : weekendState.nextSession?.label ?? 'UPCOMING'


  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--pw-bg)' }}>

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
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 px-4">
          {/* OpenF1 indicator — subscription required since mid-2026 */}
          <div className="flex items-center gap-1"
            title="OpenF1 requires paid subscription — live timing via F1 SignalR, historical data via Jolpica">
            <span className="w-1.5 h-1.5 rounded-full bg-pitwall-ghost opacity-40" aria-hidden="true" />
            <span className="font-mono text-[10px] opacity-40" style={{ color: 'var(--pw-ghost)' }}>OF1</span>
          </div>
          <span className="font-mono text-xs" style={{ color: 'var(--pw-dim)' }}>{session.clock ?? '—'}</span>
        </div>
      </div>

      {/* Track status banner */}
      <TrackStatusBanner statusCode={trackStatus.status} />

      {/* ── TOWER TAB ─────────────────────────────────────────────── */}
      {activeTab === 'TOWER' && (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

          {/* Timing tower — full width on md, dynamically expands if sidebar is hidden */}
          <SpotlightPanel 
            className={`flex flex-col border-b lg:border-b-0 border-pitwall-border overflow-hidden w-full transition-all duration-300 ${
              showSidebar ? 'lg:w-[58%] lg:border-r' : 'lg:w-full border-r-0'
            }`}
          >

            {/* Session header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-pitwall-border"
              style={{ background: 'var(--pw-surface)' }}>
              <div className="flex items-center gap-2">
                <span className="font-display font-semibold text-sm tracking-wider uppercase"
                  style={{ color: 'var(--pw-text)' }}>
                  {!isSessionActive && qualifyingGrid.length > 0 && preRaceView === 'GRID'
                    ? 'PROVISIONAL STARTING GRID'
                    : sessionHeaderTitle}
                </span>
                {isFormationLap ? (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 animate-pulse">
                    FORMATION LAP
                  </span>
                ) : !isSessionActive && qualifyingGrid.length > 0 ? (
                  <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-status-green/15 text-status-green border border-status-green/30">
                    QUALI COMPLETE
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2.5">
                {!isSessionActive && qualifyingGrid.length > 0 && (
                  <div className="flex items-center bg-pitwall-surface-2 p-0.5 rounded border border-pitwall-border">
                    <button
                      onClick={() => setPreRaceView('GRID')}
                      className={`px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded transition-colors ${
                        preRaceView === 'GRID' ? 'bg-pitwall-muted/80 text-pitwall-text-strong font-bold shadow-sm' : 'text-pitwall-ghost hover:text-pitwall-text-strong'
                      }`}
                    >
                      🏁 GRID ({qualifyingGrid.length})
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
              <div className="min-w-[480px] w-full flex flex-col flex-1">
                {/* Column headers for active live race */}
                {isSessionActive && sortedTiming.length > 0 && (
                  <div className="sticky top-0 z-10 w-full bg-pitwall-surface-2 border-b border-pitwall-border px-4 transition-all duration-300">
                    <div className="flex items-center h-7 px-0 w-full">
                      <div className="w-[3px]" />
                      <div className={`${colWidths.pos} text-center font-mono text-[10px] text-pitwall-ghost tracking-widest transition-all duration-300`}>POS</div>
                      <div className={`${colWidths.drv} font-mono text-[10px] text-pitwall-ghost tracking-widest pl-1 transition-all duration-300`}>DRV</div>
                      <div className={`${colWidths.gap} font-mono text-[10px] text-pitwall-ghost tracking-widest transition-all duration-300`}>GAP</div>
                      <div className={`${colWidths.lastLap} font-mono text-[10px] text-pitwall-ghost tracking-widest transition-all duration-300`}>LAST LAP</div>
                      <div className={`${colWidths.s1} font-mono text-[10px] text-pitwall-ghost tracking-widest text-center transition-all duration-300`}>S1</div>
                      <div className={`${colWidths.s2} font-mono text-[10px] text-pitwall-ghost tracking-widest text-center transition-all duration-300`}>S2</div>
                      <div className={`${colWidths.s3} font-mono text-[10px] text-pitwall-ghost tracking-widest text-center transition-all duration-300`}>S3</div>
                      <div className={`${colWidths.tyre} font-mono text-[10px] text-pitwall-ghost tracking-widest text-center transition-all duration-300`}>TYRE</div>
                      <div className={`${colWidths.pit} font-mono text-[10px] text-pitwall-ghost tracking-widest text-center transition-all duration-300`}>PIT</div>
                    </div>
                  </div>
                )}

                {/* Driver rows / starting grid / skeleton / smart empty state */}
                <div className={`flex-1 ${(!isSessionActive && preRaceView === 'GRID' && qualifyingGrid.length > 0) ? 'px-0 py-0' : 'px-4 py-1.5'}`}>
                  {(!isSessionActive || sortedTiming.length === 0) ? (
                    qualifyingGrid.length > 0 && preRaceView === 'GRID' ? (
                      <QualifyingGridTower grid={qualifyingGrid} raceInfo={qualiRaceInfo} loading={qualiLoading} />
                    ) : isLive && !qualifyingGrid.length ? (
                      <div>
                        {Array.from({ length: 20 }).map((_, i) => <SkeletonDriverRow key={i} />)}
                      </div>
                    ) : (
                      <TowerEmptyState weekendState={weekendState} />
                    )
                  ) : (
                    sortedTiming.map((t, index) => {
                      const driverNum  = t?.driver_number ?? t?.number
                      const driver     = driversByNumber[driverNum] ?? { number: driverNum }
                      const tyre       = tyresByDriver[driverNum]
                      const teamColour = getTeamColour(driverNum, drivers)
                      const isFav      = settings.favouriteDrivers?.includes(String(driverNum))
                      const penalty    = penaltiesByDriver[String(driverNum)]

                      const prevT = index > 0 ? sortedTiming[index - 1] : null
                      const currentGapSecs = parseGapToSeconds(t?.gap_to_leader ?? t?.gap)
                      const aheadGapSecs = prevT ? parseGapToSeconds(prevT.gap_to_leader ?? prevT.gap) : 0
                      const gapToAhead = currentGapSecs != null && aheadGapSecs != null ? currentGapSecs - aheadGapSecs : null
                      const isBattling = index > 0 && gapToAhead != null && gapToAhead < 1.0

                      const showQ1Div = isQ  && !isQ2 && index === q1Cut - 1
                      const showQ2Div = isQ2 && !isQ3 && index === q2Cut - 1
                      const showQ3Div = isQ3 && index === 9

                      return (
                        <div key={driverNum ?? index}>
                          <DriverRow
                            driver={driver}
                            timing={t}
                            tyre={tyre}
                            teamColour={teamColour}
                            isFavourite={isFav}
                            expanded={expandedDriver === driverNum}
                            onExpand={() => handleExpand(driverNum)}
                            isBattling={isBattling}
                            showSidebar={showSidebar}
                            penalty={penalty}
                          />
                          {(showQ1Div || showQ2Div || showQ3Div) && (
                            <div className="flex items-center gap-2 px-4 py-1 bg-pitwall-surface-2">
                              <div className="flex-1 h-px bg-pitwall-border" />
                              <span className="font-mono text-[10px] text-pitwall-ghost tracking-widest">
                                {showQ3Div ? 'Q3 OUT' : showQ2Div ? 'Q2 OUT' : 'Q1 OUT'}
                              </span>
                              <div className="flex-1 h-px bg-pitwall-border" />
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
            <div className="hidden lg:flex flex-col overflow-hidden transition-all duration-300" style={{ width: '42%' }}>
              <div className="flex-1 border-b border-pitwall-border overflow-hidden"
                style={{ background: 'var(--pw-surface)' }}>
                <div className="px-4 pt-3 pb-1 border-b border-pitwall-border">
                  <span className="font-mono text-[10px] tracking-widest uppercase"
                    style={{ color: 'var(--pw-ghost)' }}>
                    {isLive ? 'Track Map' : 'Circuit'}
                  </span>
                </div>
                <div className="p-4 overflow-y-auto h-full">
                  {isLive ? (
                    /* Live session — show map + live weather */
                    <div className="flex flex-col gap-4">
                      <TrackMap circuitData={weekendState.circuitData} compact showStats={false} />
                      <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase mb-2">Weather</div>
                      {weather ? (
                        <>
                          <div className="grid grid-cols-2 gap-2 mb-2">
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
          )}
        </div>
      )}

      {/* ── OTHER TABS ────────────────────────────────────────────── */}
      {activeTab === 'STRATEGY'  && <div className="flex-1 overflow-hidden"><StrategyTab /></div>}
      {activeTab === 'TELEMETRY' && <div className="flex-1 overflow-hidden"><TelemetryTab /></div>}
      {activeTab === 'RADIO'     && <div className="flex-1 overflow-hidden"><RadioTab /></div>}

      {/* Live Broadcast Event Banner Ticker */}
      <BroadcastBanner />
    </div>
  )
}
