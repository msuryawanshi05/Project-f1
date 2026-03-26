import { useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import useF1Store from '../../store/useF1Store'
import { getTeamColour, formatPitDuration } from '../../utils/driverUtils'
import TyreIcon from '../../components/ui/TyreIcon'

// ── Compound colours ──────────────────────────────────────────────────────────
const COMPOUND_COLOUR = {
  SOFT:   '#E8002D',
  MEDIUM: '#FFF200',
  HARD:   '#FFFFFF',
  INTER:  '#39B54A',
  WET:    '#0067FF',
}

// ── Stint block ───────────────────────────────────────────────────────────────
function StintBlock({ compound, lapStart, lapEnd, totalLaps, isNew }) {
  const col  = COMPOUND_COLOUR[compound?.toUpperCase()] ?? '#555'
  const pct  = totalLaps > 0 ? ((lapEnd - lapStart) / totalLaps) * 100 : 0
  const wide = pct > 4

  return (
    <div
      className="relative flex items-center justify-center h-full border-r border-black/30 overflow-hidden"
      style={{ width: `${pct}%`, backgroundColor: col, minWidth: '2px' }}
      title={`${compound} laps ${lapStart}-${lapEnd}`}
    >
      {wide && (
        <span className="font-display text-[10px] font-bold text-black/70 select-none">
          {compound?.[0] ?? '?'}
        </span>
      )}
      {!isNew && lapStart > 1 && (
        <span
          className="absolute top-0 right-0.5 font-mono text-[8px] text-black/50 leading-none"
          title="Used tyre"
        >u</span>
      )}
    </div>
  )
}

// ── Gap chart ─────────────────────────────────────────────────────────────────
function GapChart({ gapHistory, top5, drivers }) {
  if (gapHistory.length < 3) {
    return (
      <div className="flex items-center justify-center h-full text-pitwall-ghost font-mono text-xs">
        Collecting gap data…
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={gapHistory} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#1a1a1a" vertical={false} />
        <XAxis
          dataKey="lap"
          tick={{ fill: '#555', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          label={{ value: 'LAP', fill: '#444', fontSize: 9, position: 'insideBottomRight', offset: -4 }}
        />
        <YAxis
          reversed
          tick={{ fill: '#555', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          tickFormatter={(v) => `+${v.toFixed(1)}`}
          width={40}
        />
        <Tooltip
          contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: 0 }}
          labelStyle={{ color: '#888', fontFamily: 'JetBrains Mono', fontSize: 11 }}
          itemStyle={{ color: '#E5E5E5', fontFamily: 'JetBrains Mono', fontSize: 11 }}
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

// ── Pit stop row ──────────────────────────────────────────────────────────────
function PitRow({ stop }) {
  return (
    <div className="flex items-center h-8 gap-0 border-b border-pitwall-border hover:bg-pitwall-surface/30">
      <div className="w-10 text-center font-mono text-xs text-pitwall-dim">{stop.lap}</div>
      <div className="w-1.5 h-5 mr-2 rounded-sm" style={{ backgroundColor: stop.teamColour ?? '#444' }} />
      <div className="w-12 font-mono text-sm text-white">{stop.code}</div>
      <div className="w-10 text-center font-mono text-xs text-pitwall-ghost">#{stop.stop_number}</div>
      <div className="w-20 font-mono text-xs text-pitwall-text">{formatPitDuration(stop.duration)}</div>
      <div className="flex-1 font-mono text-xs text-pitwall-dim">
        {stop.old_compound && <TyreIcon compound={stop.old_compound} />}
      </div>
      <div className="w-12 flex justify-center">
        {stop.new_compound && <TyreIcon compound={stop.new_compound} />}
      </div>
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

  const totalLaps  = session.total_laps ?? 60
  const currentLap = session.lap ?? 0

  // Sort drivers by current race position
  const sortedTimings = useMemo(
    () => [...timing].sort((a, b) => (parseInt(a.position) || 99) - (parseInt(b.position) || 99)),
    [timing]
  )

  // Build stint rows from tyres[]
  // tyres[] shape: { driver_number, stint_number, compound, lap_start, lap_end, is_new, ... }
  const stintsByDriver = useMemo(() => {
    const map = {}
    tyres.forEach((t) => {
      const num = t.driver_number ?? t.number
      if (!num) return
      if (!map[num]) map[num] = []
      map[num].push(t)
    })
    // Sort stints by lap_start within each driver
    Object.values(map).forEach((stints) => stints.sort((a, b) => (a.lap_start ?? 0) - (b.lap_start ?? 0)))
    return map
  }, [tyres])

  // Top 5 driver numbers for gap chart
  const top5 = useMemo(
    () => sortedTimings.slice(0, 5).map((t) => t.driver_number ?? t.number).filter(Boolean),
    [sortedTimings]
  )

  // Build pit stop log
  const pitStops = useMemo(() => {
    const stops = []
    Object.entries(stintsByDriver).forEach(([num, stints]) => {
      const driver = drivers.find((d) => String(d.number) === String(num))
      stints.forEach((s, i) => {
        if (i === 0) return // first stint is not a stop
        stops.push({
          driver_number: num,
          code:          driver?.short_name ?? driver?.code ?? num,
          teamColour:    getTeamColour(num, drivers),
          stop_number:   i,
          lap:           s.lap_start,
          duration:      s.pit_duration ?? null,
          old_compound:  stints[i - 1]?.compound,
          new_compound:  s.compound,
        })
      })
    })
    return stops.sort((a, b) => (b.lap ?? 0) - (a.lap ?? 0))
  }, [stintsByDriver, drivers])

  const hasTyres = Object.keys(stintsByDriver).length > 0

  return (
    <div className="h-full flex flex-col overflow-hidden bg-pitwall-bg">

      {/* ── Stint Timeline ──────────────────────────────────────────── */}
      <div className="border-b border-pitwall-border">
        <div className="px-4 py-2 font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase border-b border-pitwall-border bg-[#0d0d0d]">
          Stint Timeline · Lap {currentLap}/{totalLaps}
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: '180px' }}>
          {!hasTyres ? (
            <div className="flex items-center justify-center h-16 font-mono text-xs text-pitwall-ghost">
              Tyre data not yet available
            </div>
          ) : (
            sortedTimings.map((t) => {
              const num    = t.driver_number ?? t.number
              const driver = drivers.find((d) => String(d.number) === String(num))
              const code   = driver?.short_name ?? driver?.code ?? num
              const colour = getTeamColour(num, drivers)
              const stints = stintsByDriver[num] ?? []

              return (
                <div key={num} className="flex items-center h-8 border-b border-[#1a1a1a] group relative">
                  {/* Team bar */}
                  <div className="w-[3px] h-full flex-shrink-0" style={{ backgroundColor: colour }} />

                  {/* Driver code */}
                  <div className="w-10 flex-shrink-0 font-mono text-xs text-pitwall-text text-center">
                    {code}
                  </div>

                  {/* Stint blocks */}
                  <div className="flex-1 flex h-full" style={{ position: 'relative' }}>
                    {stints.map((s, i) => (
                      <StintBlock
                        key={i}
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
                        className="absolute top-0 bottom-0 w-px bg-status-red pointer-events-none"
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
      <div className="border-b border-pitwall-border flex flex-col" style={{ height: '200px' }}>
        <div className="px-4 py-2 font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase border-b border-pitwall-border bg-[#0d0d0d] flex-shrink-0">
          Gap to Leader · Top 5
        </div>
        <div className="flex-1 p-2">
          <GapChart gapHistory={gapHistory} top5={top5} drivers={drivers} />
        </div>
      </div>

      {/* ── Pit Stop Log ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2 font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase border-b border-pitwall-border bg-[#0d0d0d] flex-shrink-0">
          Pit Stop Log
        </div>
        {/* Header row */}
        <div className="flex items-center h-7 border-b border-pitwall-border bg-[#0d0d0d]">
          <div className="w-10 text-center font-mono text-[10px] text-pitwall-ghost">LAP</div>
          <div className="w-1.5 mr-2" />
          <div className="w-12 font-mono text-[10px] text-pitwall-ghost">DRV</div>
          <div className="w-10 text-center font-mono text-[10px] text-pitwall-ghost">STOP</div>
          <div className="w-20 font-mono text-[10px] text-pitwall-ghost">DURATION</div>
          <div className="flex-1 font-mono text-[10px] text-pitwall-ghost">OUT</div>
          <div className="w-12 text-center font-mono text-[10px] text-pitwall-ghost">IN</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {pitStops.length === 0 ? (
            <div className="flex items-center justify-center h-20 font-mono text-xs text-pitwall-ghost">
              No pit stops logged yet
            </div>
          ) : (
            pitStops.map((stop, i) => <PitRow key={i} stop={stop} />)
          )}
        </div>
      </div>
    </div>
  )
}
