import { useState, useMemo, useCallback } from 'react'
import useF1Store from '../store/useF1Store'
import useRaceWeekendState from '../hooks/useRaceWeekendState'
import DriverRow from '../components/ui/DriverRow'
import TrackStatusBanner from '../components/ui/TrackStatusBanner'
import TrackMap from '../components/ui/TrackMap'
import { EmptyState } from '../components/ui/EmptyState'
import { getTeamColour } from '../utils/driverUtils'
import StrategyTab from './live/StrategyTab'
import TelemetryTab from './live/TelemetryTab'
import RadioTab from './live/RadioTab'

// ── Countdown inline ──────────────────────────────────────────────────────────
import { useState as useCountState, useEffect } from 'react'
function useCountdown(targetDt) {
  const [diff, setDiff] = useCountState(null)
  useEffect(() => {
    if (!targetDt) return
    const tick = () => {
      const ms = targetDt - Date.now()
      if (ms <= 0) { setDiff(null); return }
      setDiff({
        h: Math.floor(ms / 3600000),
        m: Math.floor((ms % 3600000) / 60000),
        s: Math.floor((ms % 60000) / 1000),
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetDt])
  return diff
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
    ? session.dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST'
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
  const countdown = useCountdown(nextSession?.targetDt)

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
          <div className="font-display font-bold text-sm text-white tracking-wide uppercase leading-tight">
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
            {countdown && (
              <span className="font-mono text-xs text-pitwall-text tabular-nums">
                {String(countdown.h).padStart(2, '0')}:{String(countdown.m).padStart(2, '0')}:{String(countdown.s).padStart(2, '0')}
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
  const countdown = useCountdown(nextSession?.targetDt)

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
        {nextSession && countdown && (
          <div className="flex flex-col items-center gap-1 mt-2">
            <div className="font-mono text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--pw-ghost)' }}>
              {nextSession.label} starts in
            </div>
            <div className="font-mono text-2xl tabular-nums"
              style={{ color: 'var(--pw-text-strong)' }}>
              {String(countdown.h).padStart(2, '0')}:{String(countdown.m).padStart(2, '00')}:{String(countdown.s).padStart(2, '00')}
            </div>
          </div>
        )}
        {nextSession && !countdown && (
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
          <div className="font-mono text-2xl text-white mt-2">
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
  const [activeTab, setActiveTab]         = useState('TOWER')
  const [expandedDriver, setExpandedDriver] = useState(null)

  const session     = useF1Store((s) => s.session)
  const trackStatus = useF1Store((s) => s.trackStatus)
  const drivers     = useF1Store((s) => s.drivers)
  const timing      = useF1Store((s) => s.timing)
  const tyres       = useF1Store((s) => s.tyres)
  const weather     = useF1Store((s) => s.weather)
  const settings    = useF1Store((s) => s.settings)

  const weekendState = useRaceWeekendState()
  const isLive = weekendState.mode === 'SESSION_LIVE'

  // Memoised derived data
  const sortedTiming = useMemo(() =>
    [...timing].sort((a, b) => {
      const pa = parseInt(a.position ?? 99, 10)
      const pb = parseInt(b.position ?? 99, 10)
      return pa - pb
    }),
    [timing]
  )

  const tyresByDriver = useMemo(
    () => Object.fromEntries(tyres.map((t) => [t.driver_number ?? t.number, t])),
    [tyres]
  )

  const driversByNumber = useMemo(
    () => Object.fromEntries(drivers.map((d) => [d.number, d])),
    [drivers]
  )

  const handleExpand = useCallback(
    (driverNum) => setExpandedDriver((prev) => prev === driverNum ? null : driverNum),
    []
  )

  const sessionName = session.name ?? ''
  const isQ  = sessionName.toUpperCase().includes('QUALIFYING') || sessionName.includes('Q1')
  const isQ2 = sessionName.includes('Q2') || sessionName.includes('Q3')
  const isQ3 = sessionName.includes('Q3')
  const q1Cut = 15, q2Cut = 10

  const RowRenderer = useCallback(({ index }) => {
    const t          = sortedTiming[index]
    const driverNum  = t?.driver_number ?? t?.number
    const driver     = driversByNumber[driverNum] ?? { number: driverNum }
    const tyre       = tyresByDriver[driverNum]
    const teamColour = getTeamColour(driverNum, drivers)
    const isFav      = settings.favouriteDrivers?.includes(String(driverNum))

    const showQ1Div = isQ  && !isQ2 && index === q1Cut - 1
    const showQ2Div = isQ2 && !isQ3 && index === q2Cut - 1
    const showQ3Div = isQ3 && index === 9

    return (
      <div>
        <DriverRow
          driver={driver}
          timing={t}
          tyre={tyre}
          teamColour={teamColour}
          isFavourite={isFav}
          expanded={expandedDriver === driverNum}
          onExpand={handleExpand}
        />
        {(showQ1Div || showQ2Div || showQ3Div) && (
          <div className="flex items-center gap-2 px-4 py-1 bg-[#0a0a0a]">
            <div className="flex-1 h-px bg-pitwall-border" />
            <span className="font-mono text-[10px] text-pitwall-ghost tracking-widest">
              {showQ3Div ? 'Q3 OUT' : showQ2Div ? 'Q2 OUT' : 'Q1 OUT'}
            </span>
            <div className="flex-1 h-px bg-pitwall-border" />
          </div>
        )}
      </div>
    )
  }, [sortedTiming, driversByNumber, tyresByDriver, drivers, settings, expandedDriver, handleExpand, isQ, isQ2, isQ3])

  // Session header text — smart based on mode
  const sessionHeaderTitle = isLive
    ? (session.name ?? 'SESSION')
    : weekendState.currentRace?.raceName ?? 'NO SESSION'

  const sessionHeaderRight = isLive
    ? ((session.phase === 'RACE' || session.phase === 'LIVE')
        ? `LAP ${session.lap ?? '—'} / ${session.total_laps ?? weekendState.circuitData?.laps ?? '—'}`
        : session.phase)
    : weekendState.mode === 'WEEKEND_BETWEEN_SESSIONS' || weekendState.mode === 'WEEKEND_SESSION_SOON'
    ? `LAP 0 / ${weekendState.circuitData?.laps ?? '—'}`
    : weekendState.nextSession?.label ?? 'UPCOMING'

  return (
    <div className="h-full flex flex-col bg-pitwall-bg">

      {/* Sub-tab bar */}
      <div className="flex border-b border-pitwall-border bg-pitwall-surface">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            aria-label={`Switch to ${tab} view`}
            className={`px-4 md:px-5 py-2 font-display text-xs tracking-widest uppercase transition-colors ${
              activeTab === tab
                ? 'text-white border-b-2 border-status-red'
                : 'text-pitwall-ghost hover:text-pitwall-dim border-b-2 border-transparent'
            }`}
          >
            {tab}
          </button>
        ))}
        <div className="ml-auto flex items-center px-4 font-mono text-xs text-pitwall-dim">
          {session.clock ?? '—'}
        </div>
      </div>

      {/* Track status banner */}
      <TrackStatusBanner statusCode={trackStatus.status} />

      {/* ── TOWER TAB ─────────────────────────────────────────────── */}
      {activeTab === 'TOWER' && (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

          {/* Timing tower — full width on md, 58% on lg+ */}
          <div className="flex flex-col border-b lg:border-b-0 lg:border-r border-pitwall-border overflow-hidden w-full lg:w-[58%]">

            {/* Session header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-pitwall-border bg-[#0d0d0d]">
              <span className="font-display font-semibold text-sm tracking-wider text-pitwall-text uppercase">
                {sessionHeaderTitle}
              </span>
              <span className="font-mono text-xs text-pitwall-dim">
                {sessionHeaderRight}
              </span>
            </div>

            {/* Column headers — only shown when live */}
            {isLive && (
              <div
                className="flex items-center h-7 bg-[#0d0d0d] border-b border-pitwall-border px-0"
                style={{ borderBottom: '1px solid #1a1a1a' }}
              >
                <div className="w-[3px]" />
                <div className="w-10 text-center font-mono text-[10px] text-pitwall-ghost tracking-widest">POS</div>
                <div className="w-7 font-mono text-[10px] text-pitwall-ghost tracking-widest">FLG</div>
                <div className="w-14 font-mono text-[10px] text-pitwall-ghost tracking-widest">DRV</div>
                <div className="w-20 font-mono text-[10px] text-pitwall-ghost tracking-widest">GAP</div>
                <div className="w-24 font-mono text-[10px] text-pitwall-ghost tracking-widest">LAST LAP</div>
                <div className="w-16 font-mono text-[10px] text-pitwall-ghost tracking-widest">S1</div>
                <div className="w-16 font-mono text-[10px] text-pitwall-ghost tracking-widest">S2</div>
                <div className="w-16 font-mono text-[10px] text-pitwall-ghost tracking-widest">S3</div>
                <div className="w-12 font-mono text-[10px] text-pitwall-ghost tracking-widest text-center">TYRE</div>
                <div className="w-8 font-mono text-[10px] text-pitwall-ghost tracking-widest">PIT</div>
              </div>
            )}

            {/* Driver rows / skeleton / smart empty state */}
            <div className="flex-1 overflow-y-auto">
              {sortedTiming.length === 0 ? (
                isLive ? (
                  <div>
                    {Array.from({ length: 20 }).map((_, i) => <SkeletonDriverRow key={i} />)}
                  </div>
                ) : (
                  <TowerEmptyState weekendState={weekendState} />
                )
              ) : (
                sortedTiming.map((_, index) => (
                  <RowRenderer
                    key={sortedTiming[index]?.driver_number ?? sortedTiming[index]?.number ?? index}
                    index={index}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right panel — track map + weather/schedule */}
          <div className="hidden lg:flex flex-col overflow-hidden" style={{ width: '42%' }}>
            <div className="flex-1 border-b border-pitwall-border bg-[#0a0a0a] overflow-hidden">
              <div className="px-4 pt-3 pb-1 border-b border-[#111]">
                <span className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase">
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
                  </div>
                ) : (
                  /* Pre-session — smart weekend panel */
                  <WeekendPanel weekendState={weekendState} weather={weather} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── OTHER TABS ────────────────────────────────────────────── */}
      {activeTab === 'STRATEGY'  && <div className="flex-1 overflow-hidden"><StrategyTab /></div>}
      {activeTab === 'TELEMETRY' && <div className="flex-1 overflow-hidden"><TelemetryTab /></div>}
      {activeTab === 'RADIO'     && <div className="flex-1 overflow-hidden"><RadioTab /></div>}
    </div>
  )
}
