import { useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  AreaChart, Area,
  LineChart, Line,
  YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts'
import useF1Store from '../../store/useF1Store'
import { getTeamColour } from '../../utils/driverUtils'
import { EmptyState } from '../../components/ui/EmptyState'

// ── Shared chart props ────────────────────────────────────────────────────────
const CHART_MARGIN  = { top: 4, right: 0, bottom: 0, left: 0 }
const AXIS_TICK     = { fill: 'var(--pw-ghost)', fontSize: 10, fontFamily: 'Orbitron' }
const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--pw-surface)', border: '1px solid var(--pw-border)', borderRadius: 0 },
  labelStyle: { color: 'var(--pw-dim)', fontFamily: 'Orbitron', fontSize: 10 },
  itemStyle:  { color: 'var(--pw-text-strong)', fontFamily: 'Orbitron', fontSize: 10 },
}

// ── Driver chip ───────────────────────────────────────────────────────────────
function DriverChip({ driver, isSelected, isCompare, onClick, drivers }) {
  const colour = getTeamColour(driver.number, drivers)
  const code   = driver.short_name ?? driver.code ?? driver.number

  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 border text-xs font-display font-bold uppercase transition-all rounded-sm clip-skew"
      style={{
        borderColor:     colour,
        backgroundColor: isSelected
          ? colour
          : isCompare
          ? `${colour}44`
          : `${colour}1A`,
        color:           isSelected ? '#000' : isCompare ? colour : 'var(--pw-dim)',
        outline:         isCompare ? `1px dashed ${colour}` : 'none',
      }}
      title={driver.full_name ?? code}
    >
      <span className="clip-skew-cancel inline-block">{code}</span>
    </button>
  )
}

// ── Chart section wrapper ─────────────────────────────────────────────────────
function ChartSection({ label, height, children }) {
  return (
    <div style={{ height }} className="flex border-b border-pitwall-border bg-pitwall-surface">
      {/* Vertical label */}
      <div className="w-8 flex-shrink-0 flex items-center justify-center bg-pitwall-surface-2 border-r border-pitwall-border">
        <span
          className="font-display text-[9px] font-bold text-pitwall-ghost tracking-widest"
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

// ── Cockpit Dashboard Widget ─────────────────────────────────────────────────
function CockpitDashboard({ speed, gear, rpm, throttle, brake, teamColour }) {
  // LED shift lights (15 LEDs: 5 green, 5 red, 5 blue)
  const totalLeds = 15
  const leds = Array.from({ length: totalLeds }).map((_, i) => {
    // Map i (0 to 14) to RPM threshold (from 8000 to 14500)
    const rpmThreshold = 8000 + i * 450
    const active = rpm >= rpmThreshold
    
    let color = 'bg-pitwall-muted'
    if (active) {
      if (i < 5) color = 'bg-sector-green shadow-[0_0_10px_var(--pw-green)]'
      else if (i < 10) color = 'bg-status-red shadow-[0_0_10px_var(--pw-red)]'
      else color = 'bg-[#0067FF] shadow-[0_0_10px_#0067FF]'
    }
    
    return (
      <div 
        key={i} 
        className={`w-2.5 h-2.5 rounded-full transition-all duration-75 ${color}`} 
      />
    )
  })

  const rpmPct = Math.min((rpm / 15000) * 100, 100)

  return (
    <div className="bg-carbon border-b border-pitwall-border p-4 flex flex-col lg:flex-row items-center gap-6 relative overflow-hidden">
      {/* Shift Light Strip */}
      <div className="lg:absolute lg:top-2 lg:left-1/2 lg:transform lg:-translate-x-1/2 flex gap-1 bg-black/60 px-3 py-1 rounded-full border border-white/5 mb-2 lg:mb-0">
        {leds}
      </div>

      {/* Speed & Gear Gauges */}
      <div className="flex items-center gap-6 mt-2 lg:mt-4 flex-shrink-0">
        {/* Speed Dial */}
        <div className="flex flex-col items-center justify-center w-24 h-24 rounded-full border border-pitwall-border bg-black/60 relative shadow-inner">
          <span className="digital-font text-3xl font-black text-white tracking-tighter leading-none">{speed}</span>
          <span className="font-display text-[9px] font-bold text-pitwall-ghost tracking-widest uppercase mt-1">KM/H</span>
        </div>

        {/* Gear Box */}
        <div 
          className="flex flex-col items-center justify-center w-20 h-20 border bg-black/80 relative shadow-lg rounded-sm clip-skew"
          style={{ borderColor: teamColour, boxShadow: `0 0 15px ${teamColour}22` }}
        >
          <div className="clip-skew-cancel flex flex-col items-center justify-center">
            <span className="digital-font text-4xl font-black text-white leading-none">{gear || 'N'}</span>
            <span className="font-display text-[9px] font-bold text-pitwall-ghost tracking-widest uppercase mt-0.5">GEAR</span>
          </div>
        </div>
      </div>

      {/* RPM Gauge */}
      <div className="flex-1 w-full mt-2 lg:mt-4">
        <div className="flex justify-between font-display text-[10px] text-pitwall-ghost mb-1 font-bold tracking-wider">
          <span>ENGINE RPM: <span className="text-pitwall-text-strong font-mono">{rpm}</span></span>
          <span>15000 LIMIT</span>
        </div>
        <div className="w-full h-3 bg-black/60 border border-pitwall-border rounded-sm overflow-hidden p-0.5">
          <div 
            className="h-full bg-gradient-to-r from-sector-green via-sector-yellow to-status-red rounded-sm transition-all duration-75"
            style={{ width: `${rpmPct}%` }}
          />
        </div>
      </div>

      {/* Dual Pedal Columns */}
      <div className="flex items-end gap-3 h-20 mt-2 lg:mt-4 bg-black/60 p-2.5 rounded-sm border border-pitwall-border flex-shrink-0">
        {/* Throttle */}
        <div className="flex flex-col items-center h-full">
          <div className="w-3 flex-1 bg-white/5 rounded-sm overflow-hidden flex flex-col justify-end">
            <div 
              className="w-full bg-sector-green rounded-sm transition-all duration-75" 
              style={{ height: `${throttle}%`, boxShadow: '0 0 8px var(--pw-green)' }}
            />
          </div>
          <span className="font-display text-[8px] font-bold text-pitwall-ghost tracking-widest uppercase mt-1">THR</span>
        </div>

        {/* Brake */}
        <div className="flex flex-col items-center h-full">
          <div className="w-3 flex-1 bg-white/5 rounded-sm overflow-hidden flex flex-col justify-end">
            <div 
              className="w-full bg-status-red rounded-sm transition-all duration-75" 
              style={{ height: `${brake}%`, boxShadow: '0 0 8px var(--pw-red)' }}
            />
          </div>
          <span className="font-display text-[8px] font-bold text-pitwall-ghost tracking-widest uppercase mt-1">BRK</span>
        </div>
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
  const carDataHistory = useF1Store((s) => s.carDataHistory)

  const [compareMode, setCompareMode] = useState(false)

  const selData = useMemo(() => carDataHistory[selDriverNum] ?? [], [carDataHistory, selDriverNum])
  const cmpData = useMemo(() => 
    (compareMode && cmpDriverNum) ? (carDataHistory[cmpDriverNum] ?? []) : [], 
    [carDataHistory, compareMode, cmpDriverNum]
  )

  const selColour = selDriverNum ? getTeamColour(selDriverNum, drivers) : '#888'
  const cmpColour = cmpDriverNum ? getTeamColour(cmpDriverNum, drivers) : '#555'

  // Limit to last 300 data points for chart performance
  const selChartData = useMemo(() => selData.slice(-300), [selData])
  const cmpChartData = useMemo(() => cmpData.slice(-300), [cmpData])

  // Get active real-time stats from last element
  const activeStats = useMemo(() => {
    return selChartData[selChartData.length - 1] ?? { speed: 0, n_gear: 'N', rpm: 0, throttle: 0, brake: 0 }
  }, [selChartData])

  function handleChipClick(num) {
    if (compareMode) {
      setCmp(num === cmpDriverNum ? null : num)
    } else {
      setSel(num === selDriverNum ? null : num)
    }
  }

  const isLive = session.phase !== 'PRE' && ['LIVE', 'RACE', 'QUALIFYING', 'PRACTICE'].includes(session.phase)

  if (!isLive || drivers.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)] bg-pitwall-bg w-full px-6">
        <EmptyState
          icon="📊"
          title="Telemetry Feed Standby"
          message="High-frequency cockpit speed, RPM, throttle, and brake telemetry activate when cars take to the track."
          className="w-full max-w-lg my-0"
        />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-pitwall-bg">

      {/* ── Driver chip row ────────────────────────────────────────── */}
      <div className="border-b border-pitwall-border bg-pitwall-surface">
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-pitwall-border">
          <span className="font-display text-[10px] text-pitwall-dim tracking-widest uppercase font-bold">
            Telemetry Feed Select
          </span>
          <button
            onClick={() => { setCompareMode(!compareMode); if (!compareMode) setCmp(null) }}
            className={`font-display text-[10px] tracking-widest px-3 py-1 border transition-colors font-bold rounded-sm ${
              compareMode
                ? 'border-sector-purple text-sector-purple bg-sector-purple/10'
                : 'border-pitwall-border text-pitwall-ghost hover:text-pitwall-dim hover:border-pitwall-muted'
            }`}
          >
            {compareMode ? 'COMPARE ON' : 'COMPARE FEED'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 px-4 py-2">
          {drivers.length === 0 ? (
            <span className="font-display text-xs text-pitwall-ghost uppercase font-bold tracking-wider">No drivers — session not active</span>
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
        <div className="flex-1 flex items-center justify-center bg-carbon px-4">
          <EmptyState
            icon="📊"
            title="Telemetry Feed Offline"
            message={isLive ? 'Select a driver above to initialize live telemetry streams and HUD dials.' : 'Select a driver to view telemetry history.'}
          />
        </div>
      ) : selData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center bg-carbon px-4">
          <EmptyState
            icon="📭"
            title="No Telemetry Received"
            message="Telemetry stream opened but no active frames received for this driver yet."
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Real-time Dashboard Cockpit HUD */}
          <CockpitDashboard 
            speed={activeStats.speed ?? 0}
            gear={activeStats.n_gear ?? activeStats.gear ?? 'N'}
            rpm={activeStats.rpm ?? 0}
            throttle={activeStats.throttle ?? 0}
            brake={activeStats.brake ?? 0}
            teamColour={selColour}
          />

          {/* HISTORICAL CHARTS */}
          {/* SPEED */}
          <ChartSection label="SPEED" height={120}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={selChartData} margin={CHART_MARGIN}>
                <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                <YAxis domain={[0, 380]} tickCount={4} tick={AXIS_TICK} width={28} />
                <ReferenceLine y={300} stroke="#333" strokeDasharray="3 3" />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${v} km/h`, 'Speed']} />
                <Area dataKey="speed" stroke={selColour} fill={`${selColour}15`} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                {compareMode && cmpChartData.length > 0 && (
                  <Area dataKey="speed" data={cmpChartData} stroke={cmpColour} fill="none" dot={false} strokeWidth={1.5} strokeDasharray="4 2" strokeOpacity={0.6} isAnimationActive={false} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* THROTTLE */}
          <ChartSection label="THROT" height={80}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={selChartData} margin={CHART_MARGIN}>
                <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                <YAxis domain={[0, 100]} tickCount={3} tick={AXIS_TICK} width={28} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${v}%`, 'Throttle']} />
                <Area dataKey="throttle" stroke="#00D2BE" fill="rgba(0,210,190,0.1)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                {compareMode && cmpChartData.length > 0 && (
                  <Area dataKey="throttle" data={cmpChartData} stroke={cmpColour} fill="none" dot={false} strokeWidth={1.5} strokeDasharray="4 2" strokeOpacity={0.6} isAnimationActive={false} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* BRAKE (binary 0/100) */}
          <ChartSection label="BRAKE" height={60}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={selChartData} margin={CHART_MARGIN}>
                <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                <YAxis domain={[0, 100]} hide />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [v === 100 ? 'ON' : 'OFF', 'Brake']} />
                <Area dataKey="brake" stroke="#E10600" fill="rgba(225,6,0,0.1)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* GEAR */}
          <ChartSection label="GEAR" height={75}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={selChartData} margin={CHART_MARGIN}>
                <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                <YAxis domain={[1, 8]} tickCount={8} tick={AXIS_TICK} width={28} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`Gear ${v}`, 'Gear']} />
                <Line dataKey="n_gear" stroke="#8F8F9E" dot={false} strokeWidth={1.5} type="stepAfter" isAnimationActive={false} />
                {compareMode && cmpChartData.length > 0 && (
                  <Line dataKey="n_gear" data={cmpChartData} stroke={cmpColour} dot={false} strokeWidth={1.5} type="stepAfter" strokeDasharray="4 2" strokeOpacity={0.6} isAnimationActive={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </ChartSection>
        </div>
      )}
    </div>
  )
}
