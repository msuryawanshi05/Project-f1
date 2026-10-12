import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import useF1Store from '../../store/useF1Store'
import { getTeamColour, formatPitDuration } from '../../utils/driverUtils'
import TyreIcon from '../../components/ui/TyreIcon'
import SpeedTrapBoard from '../../components/ui/SpeedTrapBoard'
import { PIT_LOG_COLUMNS, PIT_LOG_TEMPLATE } from '../../utils/layoutConstants'
import { useOpenF1PitStops } from '../../hooks/useOpenF1'
import { EmptyState } from '../../components/ui/EmptyState'
import useRaceWeekendState from '../../hooks/useRaceWeekendState'
import teamsData from '../../data/teams.json'

// ── Compound colours ──────────────────────────────────────────────────────────
const COMPOUND_COLOUR = {
  SOFT:         'var(--pw-red)',
  MEDIUM:       'var(--pw-tyre-medium)',
  HARD:         'var(--pw-tyre-hard)',
  INTERMEDIATE: '#00A651',
  INTER:        '#00A651',
  WET:          '#0067FF',
}

// ── Stint block ───────────────────────────────────────────────────────────────
function StintBlock({ compound, lapStart, lapEnd, totalLaps, isNew }) {
  const col  = COMPOUND_COLOUR[compound?.toUpperCase()] ?? '#555'
  const pct  = totalLaps > 0 ? ((lapEnd - lapStart) / totalLaps) * 100 : 0
  const wide = pct > 4

  return (
    <div
      className="relative flex items-center justify-center h-full border-r border-black/45 overflow-hidden transition-all duration-300 hover:brightness-110"
      style={{ 
        width: `${pct}%`, 
        background: `linear-gradient(90deg, ${col}ee 0%, ${col} 100%)`, 
        minWidth: '2px',
        boxShadow: `inset 0 -4px 10px rgba(0,0,0,0.2)`
      }}
      title={`${compound} laps ${lapStart}-${lapEnd}`}
    >
      {wide && (
        <span className="font-display text-[9px] font-black text-black/85 select-none tracking-tighter">
          {compound?.[0] ?? '?'}
        </span>
      )}
      {!isNew && lapStart > 1 && (
        <span
          className="absolute top-0.5 right-0.5 font-mono text-[7px] text-black/60 font-bold leading-none select-none"
          title="Used tyre"
        >U</span>
      )}
    </div>
  )
}

// ── Gap chart ─────────────────────────────────────────────────────────────────
function GapChart({ gapHistory, top5, drivers }) {
  if (gapHistory.length < 3) {
    return (
      <div className="p-6 h-full">
        <EmptyState
          icon="📈"
          title="Calculating Lap Intervals"
          message="Awaiting more lap data to construct relative gap progression chart."
          className="w-full my-0"
        />
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={gapHistory} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--pw-border)" vertical={false} strokeOpacity={0.4} />
        <XAxis
          dataKey="lap"
          tick={{ fill: 'var(--pw-ghost)', fontSize: 10, fontFamily: 'Orbitron' }}
          label={{ value: 'LAP', fill: 'var(--pw-ghost)', fontSize: 9, position: 'insideBottomRight', offset: -4 }}
        />
        <YAxis
          reversed
          tick={{ fill: 'var(--pw-ghost)', fontSize: 10, fontFamily: 'Orbitron' }}
          tickFormatter={(v) => `+${v.toFixed(1)}`}
          width={40}
        />
        <Tooltip
          contentStyle={{ background: 'var(--pw-surface)', border: '1px solid var(--pw-border)', borderRadius: 0 }}
          labelStyle={{ color: 'var(--pw-dim)', fontFamily: 'Orbitron', fontSize: 10 }}
          itemStyle={{ color: 'var(--pw-text-strong)', fontFamily: 'Orbitron', fontSize: 10 }}
          formatter={(val) => val != null ? [`+${Number(val).toFixed(3)}s`] : ['—']}
        />
        {top5.map((dNum) => (
          <Line
            key={dNum}
            dataKey={`gap_${dNum}`}
            stroke={getTeamColour(dNum, drivers)}
            dot={false}
            strokeWidth={1.5}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

/**
 * Pit lane time for one stop.
 *
 * Every row used to render formatPitDuration(null) as "---.---s", which looks
 * exactly like a broken formatter. Three genuinely different states must not
 * look the same:
 *   - an official timing from OpenF1 /v1/pit (lane time: entry to exit loop)
 *   - a live estimate measured client-side while the session is running
 *   - no timing published yet
 *
 * stop_duration (stationary time) is frequently absent: it was null for all 25
 * stops of the 2026 Singapore GP, so lane time is what we can actually show.
 */
function PitDuration({ stop }) {
  const value = stop.lane_duration ?? stop.pit_duration ?? stop.duration ?? null

  if (value == null) {
    return (
      <span
        className="font-mono text-[10px] text-pitwall-ghost italic"
        title="Pit lane timing has not been published for this stop yet"
      >
        not timed
      </span>
    )
  }

  const numeric = typeof value === 'number' ? value : parseFloat(String(value))
  return (
    <span className="font-mono text-xs text-pitwall-text-strong font-semibold tabular-nums">
      {Number.isFinite(numeric) ? `${numeric.toFixed(1)}s` : String(value)}
      {stop.duration_is_estimate && (
        <span
          className="ml-1 text-[8px] text-pitwall-ghost align-middle"
          title="Measured in the browser from pit entry to exit, not an official timing"
        >
          ~
        </span>
      )}
    </span>
  )
}

// ── Collapsible Driver Pit Group ──────────────────────────────────────────────
function DriverPitGroup({ group }) {
  const [expanded, setExpanded] = useState(false)
  
  if (!group || group.length === 0) return null
  
  const latestStop = group[0]
  const earlierStops = group.slice(1)
  const hasHistory = earlierStops.length > 0
  
  return (
    <div className="flex flex-col border-b border-pitwall-border/20">
      {/* Latest / main stop row */}
      <div
        className={`grid items-center h-10 px-4 gap-3 transition-colors select-none ${
          hasHistory ? 'cursor-pointer hover:bg-pitwall-surface/20' : 'hover:bg-pitwall-surface/10'
        }`}
        style={{ gridTemplateColumns: PIT_LOG_TEMPLATE }}
        onClick={() => hasHistory && setExpanded(!expanded)}
      >
        <div className="text-center font-mono text-xs text-pitwall-dim font-bold tabular-nums">
          {latestStop.lap}
        </div>
        <div className="h-5 w-full" style={{ backgroundColor: latestStop.teamColour ?? '#444' }} />
        <div className="font-display font-extrabold text-xs text-pitwall-text-strong tracking-wider truncate">
          {latestStop.code}
        </div>
        <div className="text-center font-display text-[9px] text-pitwall-ghost font-bold flex items-center justify-center gap-1">
          {latestStop.stop_number}
          {latestStop.is_sc && (
            <span className="text-status-yellow font-extrabold text-[8px] px-1 bg-status-yellow/15 border border-status-yellow/30 rounded" title="Stop executed under Safety Car or Red Flag">
              SC
            </span>
          )}
        </div>
        <PitDuration stop={latestStop} />
        <div className="font-display text-[9px] text-pitwall-dim font-bold uppercase flex items-center gap-1.5 min-w-0">
          {latestStop.old_compound && latestStop.old_compound !== 'UNKNOWN' && (
            <>
              <span className="text-pitwall-text-strong truncate">{latestStop.old_compound}</span>
              <span className="text-pitwall-ghost">-&gt;</span>
            </>
          )}
          {latestStop.new_compound && latestStop.new_compound !== 'UNKNOWN'
            ? <TyreIcon compound={latestStop.new_compound} compact />
            : <span className="text-pitwall-ghost">&mdash;</span>}
        </div>
        <div className="flex items-center justify-end">
          {hasHistory && (
            <span
              className={`text-[8px] px-1.5 py-0.5 border border-pitwall-border rounded-sm text-pitwall-ghost bg-white/5 font-extrabold select-none whitespace-nowrap transition-all duration-200 ${
                expanded ? 'bg-status-red/15 border-status-red/35 text-status-red shadow-sm' : ''
              }`}
            >
              {expanded ? 'CLOSE' : `+${earlierStops.length}`}
            </span>
          )}
        </div>
      </div>

      {/* Expanded history rows */}
      {hasHistory && expanded && (
        <div className="bg-black/25 divide-y divide-pitwall-border/10 border-t border-pitwall-border/15">
          {earlierStops.map((stop) => (
            <div 
              key={`earlier-${stop.driver_number}-${stop.stop_number}`}
              className="grid items-center h-8 px-4 gap-3 opacity-75 hover:opacity-100 transition-opacity"
              style={{ gridTemplateColumns: PIT_LOG_TEMPLATE }}
            >
              {/* Left nesting border indicator */}
              <div className="w-[1.5px] h-full bg-pitwall-border/40 mr-2" />
              
              <div className="w-10 text-center font-mono text-[10px] text-pitwall-ghost">
                L{stop.lap}
              </div>
              <div className="w-[2px] h-4 mr-2" style={{ backgroundColor: stop.teamColour ?? '#444' }} />
              <div className="w-12 font-display font-medium text-[10px] text-pitwall-ghost tracking-wider opacity-60">
                {stop.code}
              </div>
              <div className="w-10 text-center font-display text-[8px] text-pitwall-ghost">
                STOP {stop.stop_number}
              </div>
              <div className="w-20 font-mono text-[10px] text-pitwall-ghost font-medium">
                {formatPitDuration(stop.duration)}
              </div>
              <div className="flex-1 font-display text-[8px] text-pitwall-ghost uppercase flex items-center gap-1.5 pl-1">
                {stop.old_compound && (
                  <>
                    <span>OUT:</span>
                    <span className="font-semibold">{stop.old_compound}</span>
                  </>
                )}
              </div>
              <div className="w-16 flex items-center justify-end pr-8">
                {stop.new_compound && <TyreIcon compound={stop.new_compound} compact />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Strategy Tab ──────────────────────────────────────────────────────────────
export default function StrategyTab() {
  const session    = useF1Store((s) => s.session)
  const timing     = useF1Store((s) => s.timing)
  const tyres      = useF1Store((s) => s.tyres)
  const drivers    = useF1Store((s) => s.drivers)
  const gapHistory = useF1Store((s) => s.gapHistory)
  const storePitStops = useF1Store((s) => s.pitStops)
  const raceControl = useF1Store((s) => s.raceControl)

  const sessionKey = useF1Store((s) => s.currentSessionKey)
  // Official pit lane timings. The log previously had no duration source at
  // all once a session ended — stint-derived stops carry no timing and the
  // live client-side estimate only exists while the feed is running — so every
  // row rendered "---.---s", which reads as a broken formatter rather than
  // missing data.
  const { stops: officialPitStops } = useOpenF1PitStops(sessionKey)

  const weekendState = useRaceWeekendState()
  const circuitLaps  = weekendState.circuitData?.laps
  // No invented fallback (was `|| 60`): circuitLaps is null for circuits with
  // no verified lap count, and a guessed total silently rescales every stint
  // bar on the timeline.
  const totalLaps    = session.total_laps || circuitLaps || null
  const currentLap   = session.lap ?? null

  // Sort drivers by current race position
  const sortedTimings = useMemo(
    () => [...timing].sort((a, b) => (parseInt(a.position, 10) || 99) - (parseInt(b.position, 10) || 99)),
    [timing]
  )

  // Build stint rows from tyres[] (supporting backend-provided stints lists)
  const stintsByDriver = useMemo(() => {
    const map = {}
    tyres.forEach((t) => {
      const num = t.driver_number ?? t.number
      if (!num) return
      
      if (t.stints && t.stints.length > 0) {
        map[num] = t.stints.map((s) => ({
          driver_number: num,
          compound: s.compound,
          stint_number: s.stint_index + 1,
          laps: s.laps,
        }))
        
        let currentStart = 1
        map[num].forEach((stint) => {
          stint.lap_start = currentStart
          stint.lap_end = currentStart + stint.laps
          currentStart = stint.lap_end
        })
      } else {
        if (!map[num]) map[num] = []
        map[num].push({
          ...t,
          lap_start: 1,
          lap_end: currentLap ?? 1,
        })
      }
    })
    
    Object.values(map).forEach((stints) => stints.sort((a, b) => (a.lap_start ?? 0) - (b.lap_start ?? 0)))
    return map
  }, [tyres, currentLap])

  // Top 5 driver numbers for gap chart
  const top5 = useMemo(
    () => sortedTimings.slice(0, 5).map((t) => t.driver_number ?? t.number).filter(Boolean),
    [sortedTimings]
  )

  // Build pit stop log (merging stint-derived stops and live notification-derived stops)
  const pitStops = useMemo(() => {
    const isScLap = (lapNumber) => {
      if (!lapNumber || !Array.isArray(raceControl)) return false
      return raceControl.some(
        (msg) => msg.lap === lapNumber && (msg.flag === 'SC' || msg.flag === 'RED' || msg.category === 'SafetyCar' || msg.flag === 'VSC')
      )
    }

    const stops = []
    
    // 1. Add stints-derived stops
    Object.entries(stintsByDriver).forEach(([num, stints]) => {
      const driver = drivers.find((d) => String(d.number) === String(num))
      stints.forEach((s, i) => {
        if (i === 0) return
        stops.push({
          driver_number: num,
          code:          driver?.short_name ?? driver?.code ?? teamsData.driverCodes[String(num)] ?? num,
          teamColour:    getTeamColour(num, drivers),
          stop_number:   i,
          lap:           s.lap_start,
          duration:      s.pit_duration ?? null,
          old_compound:  stints[i - 1]?.compound,
          new_compound:  s.compound,
          is_sc:         isScLap(s.lap_start),
        })
      })
    })

    // 2. Add live store stops
    storePitStops.forEach((storeStop) => {
      const exists = stops.some(
        (s) => String(s.driver_number) === String(storeStop.driver_number) && s.stop_number === storeStop.stop_number
      )
      if (!exists) {
        const driver = drivers.find((d) => String(d.number) === String(storeStop.driver_number))
        stops.push({
          ...storeStop,
          code: driver?.short_name ?? driver?.code ?? teamsData.driverCodes[String(storeStop.driver_number)] ?? storeStop.driver_number,
          teamColour: getTeamColour(storeStop.driver_number, drivers),
          is_sc: isScLap(storeStop.lap),
        })
      }
    })
    
    // Attach official lane timings. Matched on driver + lap; the lap a stop is
    // recorded against can differ by one between sources, so allow +/-1 before
    // giving up rather than silently showing nothing.
    if (officialPitStops.length > 0) {
      const byDriver = {}
      for (const o of officialPitStops) {
        (byDriver[String(o.driver_number)] ||= []).push(o)
      }
      for (const stop of stops) {
        const candidates = byDriver[String(stop.driver_number)] ?? []
        const match = candidates.find((o) => o.lap_number === stop.lap)
          ?? candidates.find((o) => Math.abs((o.lap_number ?? -99) - (stop.lap ?? 99)) <= 1)
        if (match) {
          stop.lane_duration = match.lane_duration ?? match.pit_duration ?? null
          stop.stop_duration = match.stop_duration ?? null
          stop.duration_is_estimate = false
        } else if (stop.duration != null) {
          // Client-measured fallback — flagged so the UI can mark it as an
          // estimate rather than passing it off as an official timing.
          stop.duration_is_estimate = true
        }
      }
    } else {
      for (const stop of stops) {
        if (stop.duration != null) stop.duration_is_estimate = true
      }
    }

    return stops.sort((a, b) => (b.lap ?? 0) - (a.lap ?? 0))
  }, [stintsByDriver, drivers, storePitStops, raceControl, officialPitStops])

  // Group stops by driver and sort groups by the latest stop's lap descending
  const groupedPitStops = useMemo(() => {
    const groups = {}
    pitStops.forEach((stop) => {
      const num = stop.driver_number
      if (!groups[num]) {
        groups[num] = []
      }
      groups[num].push(stop)
    })
    
    Object.values(groups).forEach((list) => {
      list.sort((a, b) => (b.stop_number ?? 0) - (a.stop_number ?? 0))
    })
    
    return Object.values(groups).sort((groupA, groupB) => {
      const latestLapA = groupA[0]?.lap ?? 0
      const latestLapB = groupB[0]?.lap ?? 0
      return latestLapB - latestLapA
    })
  }, [pitStops])

  const hasTyres = Object.keys(stintsByDriver).length > 0
  // Show strategy whenever there IS strategy to show. Gating on a live phase
  // meant the stint timeline, pit log and trap speeds all vanished the moment
  // the chequered flag fell — which is precisely when you want to review them.
  const isSessionActive = session.phase !== 'PRE' && sortedTimings.length > 0

  if (!isSessionActive) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)] bg-pitwall-bg w-full px-6">
        <EmptyState
          icon="⏱️"
          title="Strategy Feed Standby"
          message="Tyre stints, pit stops and trap speeds appear once cars are on track, and stay available after the session ends."
          className="w-full max-w-lg my-0"
        />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 bg-pitwall-bg">

      {/* ── Stint Timeline ──────────────────────────────────────────── */}
      <div className="border border-pitwall-border rounded bg-pitwall-surface/20 flex flex-col overflow-hidden">
        <div className="px-4 py-2 font-display text-[10px] text-pitwall-dim tracking-widest uppercase border-b border-pitwall-border bg-pitwall-surface-2 flex-shrink-0 font-bold">
          Stint Lifecycle Timeline · LAP {currentLap}/{totalLaps}
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
          {!hasTyres ? (
            <div className="p-6">
              <EmptyState
                icon="📊"
                title="Stint Timeline Empty"
                message="Establishing telemetry links... Stint history will display here once drivers exit pitlane."
                className="w-full my-0"
              />
            </div>
          ) : (
            sortedTimings.map((t) => {
              const num    = t.driver_number ?? t.number
              const driver = drivers.find((d) => String(d.number) === String(num))
              const code   = driver?.short_name ?? driver?.code ?? teamsData.driverCodes[String(num)] ?? num
              const colour = getTeamColour(num, drivers)
              const stints = stintsByDriver[num] ?? []

              return (
                <div key={num} className="flex items-center h-8 border-b border-pitwall-border/30 hover:bg-pitwall-surface/20 transition-colors group relative select-none">
                  {/* Team bar */}
                  <div className="w-[3px] h-full flex-shrink-0" style={{ backgroundColor: colour }} />

                  {/* Driver code */}
                  <div className="w-10 flex-shrink-0 font-display font-extrabold text-xs text-pitwall-text-strong text-center tracking-widest">
                    {code}
                  </div>

                  {/* Stint blocks */}
                  <div className="flex-1 flex h-full" style={{ position: 'relative' }}>
                    {stints.map((s, i) => (
                      <StintBlock
                        key={`stint-${num}-${s.lap_start ?? i}`}
                        compound={s.compound}
                        lapStart={s.lap_start ?? 0}
                        lapEnd={s.lap_end ?? currentLap}
                        totalLaps={totalLaps}
                        isNew={s.is_new !== false}
                      />
                    ))}

                    {/* Current lap red line */}
                    {currentLap > 0 && totalLaps > 0 && (
                      <div
                        className="absolute top-0 bottom-0 w-[1.5px] bg-status-red pointer-events-none shadow-[0_0_4px_var(--pw-red)]"
                        style={{ left: `${(currentLap / totalLaps) * 100}%` }}
                      />
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Gap Chart ───────────────────────────────────────────────── */}
      <div className="border border-pitwall-border rounded bg-pitwall-surface/20 flex flex-col overflow-hidden" style={{ height: '300px' }}>
        <div className="px-4 py-2 font-display text-[10px] text-pitwall-dim tracking-widest uppercase border-b border-pitwall-border bg-pitwall-surface-2 flex-shrink-0 font-bold">
          Leader Gap Interval · TOP 5 DRIVERS
        </div>
        <div className="flex-1 p-4 bg-pitwall-bg">
          <GapChart gapHistory={gapHistory} top5={top5} drivers={drivers} />
        </div>
      </div>

      {/* ── Speed Traps ─────────────────────────────────────────────── */}
      {/* TimingData.Speeds{I1,I2,FL,ST} — extracted from the feed for the first
          time this pass. Matters more in 2026: MOM creates large speed deltas
          between cars at the same point on track. */}
      <div className="border border-pitwall-border rounded bg-pitwall-surface/20 flex flex-col overflow-hidden">
        <div className="px-4 py-2 font-display text-[10px] text-pitwall-dim tracking-widest uppercase border-b border-pitwall-border bg-pitwall-surface-2 flex-shrink-0 font-bold">
          Speed Traps · Session Best Per Loop
        </div>
        <SpeedTrapBoard timing={sortedTimings} drivers={drivers} />
      </div>

      {/* ── Pit Stop Log ────────────────────────────────────────────── */}
      <div className="border border-pitwall-border rounded bg-pitwall-surface/20 flex flex-col overflow-hidden">
        <div className="px-4 py-2 font-display text-[10px] text-pitwall-dim tracking-widest uppercase border-b border-pitwall-border bg-pitwall-surface-2 flex-shrink-0 font-bold">
          Pit Stop Log
        </div>
        {/* Header row */}
        {/* Same PIT_LOG_TEMPLATE as the rows - aligned by construction. */}
        <div
          className="grid items-center h-7 px-4 gap-3 border-b border-pitwall-border bg-pitwall-surface-2/40"
          style={{ gridTemplateColumns: PIT_LOG_TEMPLATE }}
          role="row"
        >
          {PIT_LOG_COLUMNS.map((col) => (
            <div
              key={col.key}
              role="columnheader"
              className="font-display font-bold text-[9px] text-pitwall-ghost tracking-widest"
              style={{ textAlign: col.align }}
            >
              {col.label}
            </div>
          ))}
        </div>
        <div className="overflow-y-auto divide-y divide-pitwall-border/30 bg-pitwall-bg" style={{ maxHeight: '300px' }}>
          {groupedPitStops.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon="🔧"
                title="No Pit Stops Logged"
                message="All drivers currently executing initial session stints."
                className="w-full my-0"
              />
            </div>
          ) : (
            groupedPitStops.map((group) => (
              <DriverPitGroup 
                key={`pit-group-${group[0]?.driver_number}`} 
                group={group} 
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
