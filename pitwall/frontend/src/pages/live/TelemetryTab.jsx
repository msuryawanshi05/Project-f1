import { useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart, Area,
  LineChart, Line,
  YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts'
import useF1Store from '../../store/useF1Store'
import { getTeamColour } from '../../utils/driverUtils'
import { useCarData } from '../../hooks/useCarData'

// ── Shared chart props ────────────────────────────────────────────────────────
const CHART_MARGIN  = { top: 4, right: 0, bottom: 0, left: 0 }
const AXIS_TICK     = { fill: '#555', fontSize: 10, fontFamily: 'JetBrains Mono' }
const TOOLTIP_STYLE = {
  contentStyle: { background: '#111', border: '1px solid #222', borderRadius: 0 },
  labelStyle: { color: '#666', fontFamily: 'JetBrains Mono', fontSize: 10 },
  itemStyle:  { color: '#E5E5E5', fontFamily: 'JetBrains Mono', fontSize: 10 },
}

// ── Driver chip ───────────────────────────────────────────────────────────────
function DriverChip({ driver, isSelected, isCompare, onClick, drivers }) {
  const colour = getTeamColour(driver.number, drivers)
  const code   = driver.short_name ?? driver.code ?? driver.number

  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 border text-xs font-mono transition-all"
      style={{
        borderColor:     colour,
        backgroundColor: isSelected
          ? colour
          : isCompare
          ? `${colour}44`
          : `${colour}1A`,
        color:           isSelected ? '#000' : isCompare ? colour : '#888',
        outline:         isCompare ? `1px dashed ${colour}` : 'none',
      }}
      title={driver.full_name ?? code}
    >
      {code}
    </button>
  )
}

// ── Chart section wrapper ─────────────────────────────────────────────────────
function ChartSection({ label, height, children }) {
  return (
    <div style={{ height }} className="flex border-b border-pitwall-border">
      {/* Vertical label */}
      <div className="w-8 flex-shrink-0 flex items-center justify-center bg-[#0d0d0d] border-r border-pitwall-border">
        <span
          className="font-mono text-[9px] text-pitwall-ghost tracking-widest"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}
        >
          {label}
        </span>
      </div>
      <div className="flex-1 overflow-hidden p-1">
        {children}
      </div>
    </div>
  )
}

// ── Telemetry Tab ─────────────────────────────────────────────────────────────
export default function TelemetryTab() {
  const session       = useF1Store((s) => s.session)
  const drivers       = useF1Store((s) => s.drivers)
  const selDriverNum  = useF1Store((s) => s.selectedTelemetryDriver)
  const cmpDriverNum  = useF1Store((s) => s.compareTelemetryDriver)
  const setSel        = useF1Store((s) => s.setSelectedTelemetryDriver)
  const setCmp        = useF1Store((s) => s.setCompareTelemetryDriver)

  const [compareMode, setCompareMode] = useState(false)

  const isLive       = ['LIVE', 'RACE', 'QUALIFYING', 'PRACTICE'].includes(session.phase)
  const sessionKey   = session.session_key ?? 'latest'

  const { data: selData, loading: selLoading } = useCarData(selDriverNum, sessionKey, isLive)
  const { data: cmpData }                       = useCarData(
    compareMode ? cmpDriverNum : null, sessionKey, isLive
  )

  const selColour = selDriverNum ? getTeamColour(selDriverNum, drivers) : '#888'
  const cmpColour = cmpDriverNum ? getTeamColour(cmpDriverNum, drivers) : '#555'

  function handleChipClick(num) {
    if (compareMode) {
      setCmp(num === cmpDriverNum ? null : num)
    } else {
      setSel(num === selDriverNum ? null : num)
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-pitwall-bg">

      {/* ── Driver chip row ────────────────────────────────────────── */}
      <div className="border-b border-pitwall-border bg-pitwall-surface">
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-pitwall-border">
          <span className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase">
            Select Driver
          </span>
          <button
            onClick={() => { setCompareMode(!compareMode); if (!compareMode) setCmp(null) }}
            className={`font-mono text-[10px] tracking-widest px-2 py-0.5 border transition-colors ${
              compareMode
                ? 'border-sector-purple text-sector-purple bg-sector-purple/10'
                : 'border-pitwall-border text-pitwall-ghost hover:text-pitwall-dim'
            }`}
          >
            {compareMode ? 'COMPARE ON' : 'COMPARE'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 px-4 py-2">
          {drivers.length === 0 ? (
            <span className="font-mono text-xs text-pitwall-ghost">No drivers — session not active</span>
          ) : (
            drivers.map((d) => (
              <DriverChip
                key={d.number}
                driver={d}
                isSelected={!compareMode && d.number === selDriverNum}
                isCompare={compareMode && d.number === cmpDriverNum}
                onClick={() => handleChipClick(d.number)}
                drivers={drivers}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Charts or empty state ───────────────────────────────────── */}
      {!selDriverNum ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-pitwall-ghost">
          <span className="font-mono text-sm">Select a driver above to view telemetry</span>
          <span className="font-mono text-xs text-pitwall-ghost/50">
            {isLive ? 'Live telemetry updates every 4s' : 'Telemetry available during live sessions only'}
          </span>
        </div>
      ) : selLoading && selData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center font-mono text-xs text-pitwall-ghost">
          Loading telemetry…
        </div>
      ) : selData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center font-mono text-xs text-pitwall-ghost">
          No telemetry data available for this driver
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* SPEED */}
          <ChartSection label="SPEED" height={120}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={selData} margin={CHART_MARGIN}>
                <CartesianGrid stroke="#111" vertical={false} />
                <YAxis domain={[0, 380]} tickCount={4} tick={AXIS_TICK} width={28} />
                <ReferenceLine y={300} stroke="#333" strokeDasharray="3 3" />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${v} km/h`, 'Speed']} />
                <Area dataKey="speed" stroke={selColour} fill={`${selColour}22`} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                {compareMode && cmpData.length > 0 && (
                  <Area dataKey="speed" data={cmpData} stroke={cmpColour} fill="none" dot={false} strokeWidth={1.5} strokeDasharray="4 2" strokeOpacity={0.6} isAnimationActive={false} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* THROTTLE */}
          <ChartSection label="THROT" height={80}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={selData} margin={CHART_MARGIN}>
                <YAxis domain={[0, 100]} tickCount={3} tick={AXIS_TICK} width={28} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${v}%`, 'Throttle']} />
                <Area dataKey="throttle" stroke="#00A651" fill="#00A65122" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                {compareMode && cmpData.length > 0 && (
                  <Area dataKey="throttle" data={cmpData} stroke={cmpColour} fill="none" dot={false} strokeWidth={1.5} strokeDasharray="4 2" strokeOpacity={0.6} isAnimationActive={false} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* BRAKE (binary 0/100) */}
          <ChartSection label="BRAKE" height={60}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={selData} margin={CHART_MARGIN}>
                <YAxis domain={[0, 100]} hide />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [v === 100 ? 'ON' : 'OFF', 'Brake']} />
                <Area dataKey="brake" stroke="#E8002D" fill="#E8002D44" dot={false} strokeWidth={1} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* GEAR */}
          <ChartSection label="GEAR" height={70}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={selData} margin={CHART_MARGIN}>
                <YAxis domain={[1, 8]} tickCount={8} tick={AXIS_TICK} width={28} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`Gear ${v}`, 'Gear']} />
                <Line dataKey="n_gear" stroke="#888888" dot={false} strokeWidth={1} type="stepAfter" isAnimationActive={false} />
                {compareMode && cmpData.length > 0 && (
                  <Line dataKey="n_gear" data={cmpData} stroke={cmpColour} dot={false} strokeWidth={1} type="stepAfter" strokeDasharray="4 2" strokeOpacity={0.6} isAnimationActive={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </ChartSection>
        </div>
      )}
    </div>
  )
}
