import { useState, useMemo } from 'react'

import useF1Store from '../store/useF1Store'
import DriverRow from '../components/ui/DriverRow'
import TrackStatusBanner from '../components/ui/TrackStatusBanner'
import { getTeamColour } from '../utils/driverUtils'
import StrategyTab from './live/StrategyTab'
import TelemetryTab from './live/TelemetryTab'
import RadioTab from './live/RadioTab'

// ── Weather tile ──────────────────────────────────────────────────────────────
function WeatherTile({ label, value, accent = false }) {
  return (
    <div className="bg-[#0d0d0d] border border-pitwall-border p-3 flex flex-col gap-1">
      <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase">{label}</div>
      <div className={`font-mono text-lg font-medium ${accent ? 'text-status-green' : 'text-pitwall-text'}`}>
        {value ?? '—'}
      </div>
    </div>
  )
}

// ── Skeleton row (20 shown while live session awaits timing data) ─────────────
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

// ── Sub-tab labels ────────────────────────────────────────────────────────────
const TABS = ['TOWER', 'STRATEGY', 'TELEMETRY', 'RADIO']

// ── Live page ─────────────────────────────────────────────────────────────────
export default function Live() {
  const [activeTab, setActiveTab] = useState('TOWER')

  const session     = useF1Store((s) => s.session)
  const trackStatus = useF1Store((s) => s.trackStatus)
  const drivers     = useF1Store((s) => s.drivers)
  const timing      = useF1Store((s) => s.timing)
  const tyres       = useF1Store((s) => s.tyres)
  const weather     = useF1Store((s) => s.weather)
  const settings    = useF1Store((s) => s.settings)

  const isLive = ['LIVE', 'RACE', 'QUALIFYING', 'PRACTICE'].includes(session.phase)

  // ── Memoised derived data — avoids O(n) finds on every 2s timing tick ───────
  const sortedTiming = useMemo(() =>
    [...timing].sort((a, b) => {
      const pa = parseInt(a.position ?? 99, 10)
      const pb = parseInt(b.position ?? 99, 10)
      return pa - pb
    }),
    [timing]
  )

  // O(1) lookups — stable map references so DriverRow memo comparator holds
  const tyresByDriver = useMemo(
    () => Object.fromEntries(tyres.map((t) => [t.driver_number ?? t.number, t])),
    [tyres]
  )

  const driversByNumber = useMemo(
    () => Object.fromEntries(drivers.map((d) => [d.number, d])),
    [drivers]
  )

  // Qualifying elimination zone helpers
  const sessionName = session.name ?? ''
  const isQ  = sessionName.toUpperCase().includes('QUALIFYING') || sessionName.includes('Q1')
  const isQ2 = sessionName.includes('Q2') || sessionName.includes('Q3')
  const isQ3 = sessionName.includes('Q3')
  const q1Cut = 15, q2Cut = 10

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
                {session.name ?? 'NO SESSION'}
              </span>
              <span className="font-mono text-xs text-pitwall-dim">
                {session.phase === 'RACE' || session.phase === 'LIVE'
                  ? `LAP ${session.lap ?? '—'} / ${session.total_laps ?? '—'}`
                  : session.phase}
              </span>
            </div>

            {/* Column headers */}
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

            {/* Driver rows / skeleton / empty state */}
            <div className="flex-1 overflow-y-auto">
              {sortedTiming.length === 0 ? (
                isLive ? (
                  Array.from({ length: 20 }).map((_, i) => <SkeletonDriverRow key={i} />)
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-center gap-3 text-pitwall-ghost">
                    <span className="text-4xl">🏁</span>
                    <p className="font-display text-base text-pitwall-dim">No session active</p>
                    <p className="font-mono text-xs">PITWALL activates 5 minutes before the next session</p>
                  </div>
                )
              ) : (
                sortedTiming.map((t, idx) => {
                  const driverNum  = t.driver_number ?? t.number
                  const driver     = driversByNumber[driverNum] ?? { number: driverNum }
                  const tyre       = tyresByDriver[driverNum]
                  const teamColour = getTeamColour(driverNum, drivers)
                  const isFav      = settings.favouriteDrivers?.includes(String(driverNum))

                  const showQ1Div = isQ  && !isQ2 && idx === q1Cut - 1
                  const showQ2Div = isQ2 && !isQ3 && idx === q2Cut - 1
                  const showQ3Div = isQ3 && idx === 9

                  return (
                    <div key={driverNum ?? idx}>
                      <DriverRow
                        driver={driver}
                        timing={t}
                        tyre={tyre}
                        teamColour={teamColour}
                        isFavourite={isFav}
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
                })
              )}
            </div>
          </div>

          {/* Track map + Weather — hidden on md, 42% on lg+ */}
          <div className="hidden lg:flex flex-col" style={{ width: '42%' }}>

            <div className="flex-1 border-b border-pitwall-border bg-[#0a0a0a] flex flex-col items-center justify-center p-4 gap-3">
              <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase self-start">
                Track Map
              </div>
              <div className="w-full aspect-video flex items-center justify-center border border-pitwall-border bg-[#0d0d0d]">
                <div className="flex flex-col items-center gap-2 text-pitwall-ghost">
                  <span className="text-2xl">⬡</span>
                  <span className="font-mono text-xs">{session.name ?? 'No Circuit Selected'}</span>
                  <span className="font-mono text-[10px] text-pitwall-ghost/50">Track map loads during live session</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-pitwall-surface">
              <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase mb-3">Weather</div>
              {weather ? (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <WeatherTile label="Track Temp" value={`${weather.track_temperature ?? '—'}°C`} />
                    <WeatherTile label="Air Temp"   value={`${weather.air_temperature ?? '—'}°C`} />
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
