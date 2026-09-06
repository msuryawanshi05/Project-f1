import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import useF1Store from '../store/useF1Store'
import useRaceWeekendState from '../hooks/useRaceWeekendState'
import RaceStoryStack from '../components/results/RaceStoryStack'
import { EmptyState } from '../components/ui/EmptyState'
import { getCountryAbbreviation } from '../utils/driverUtils'
import { useTilt } from '../hooks/useTilt'

const BASE = 'https://api.jolpi.ca/ergast/f1/2026'

function getFlag(country) { return getCountryAbbreviation(country) }

const TEAM_COL_MAP = {
  'Red Bull': '#3671C6', Ferrari: '#E8002D', Mercedes: '#27F4D2',
  McLaren: '#FF8000', 'Aston Martin': '#229971', Alpine: '#FF87BC',
  Williams: '#64C4FF', RB: '#6692FF', Haas: '#B6BABD', Sauber: '#52E252',
  Audi: '#A6A6A6', Cadillac: '#EEB211',
}
function teamColour(name) {
  return Object.entries(TEAM_COL_MAP).find(([k]) =>
    name?.toLowerCase().includes(k.toLowerCase())
  )?.[1] ?? '#666'
}

// ── Podium card — stepped glass stands, glowing team colors ───────────────────
function PodiumCard({ result, pos }) {
  if (!result) return null
  const d    = result.Driver ?? {}
  const team = result.Constructor?.name ?? ''
  const code = d.code ?? '???'
  const time = result.Time?.time ?? result.status ?? '—'
  const col  = teamColour(team)
  const isP1 = pos === 1
  const isP2 = pos === 2

  const heightCls = isP1 ? 'min-h-[165px]' : isP2 ? 'min-h-[150px]' : 'min-h-[135px]'
  const delay = pos === 2 ? 0.1 : pos === 1 ? 0.3 : 0.5

  const { ref, rotateX, rotateY, onMouseMove, onMouseLeave } = useTilt(6)

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      whileHover={{ scale: 1.02 }}
      className={`flex-1 flex flex-col justify-end p-4 border border-pitwall-border relative overflow-hidden ${heightCls} rounded-sm glow-card`}
      style={{
        borderTop: `3.5px solid ${col}`,
        background: `linear-gradient(180deg, var(--pw-surface) 0%, ${col}20 100%)`,
        boxShadow: `0 8px 30px ${col}10`,
        rotateX,
        rotateY,
        transformPerspective: 800,
      }}
    >
      {/* P1 Shine sweep */}
      {isP1 && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(110deg, transparent 30%, rgba(255,215,0,0.2) 50%, transparent 70%)' }}
          initial={{ x: '-100%' }}
          animate={{ x: '200%' }}
          transition={{ duration: 1.4, delay: 0.6, ease: 'easeInOut' }}
        />
      )}

      {/* Glow in background */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-10 opacity-30 pointer-events-none blur-md"
        style={{ background: col }}
      />
      
      {/* Position Badge in corner */}
      <div 
        className="absolute top-2 right-2 font-display text-[28px] font-extrabold italic opacity-15 leading-none select-none"
        style={{ color: col }}
      >
        P{pos}
      </div>

      {/* Code */}
      <div className="font-display font-black tracking-wider leading-snug text-2xl" style={{ color: col }}>
        {code}
      </div>
      
      {/* Name */}
      <div className="font-body text-xs font-semibold mt-1 truncate text-pitwall-text leading-snug">
        {d.familyName?.toUpperCase()}
      </div>
      
      {/* Team */}
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: col }} />
        <span className="font-display text-[10px] tracking-widest font-bold truncate uppercase text-pitwall-text-none leading-none">
          {team}
        </span>
      </div>
      
      {/* Time */}
      <div className="font-mono text-[9px] mt-2 pt-1.5 border-t border-pitwall-border flex justify-between" style={{ color: 'var(--pw-text-strong)' }}>
        <span className="text-pitwall-dim">TIME:</span>
        <span className="font-bold">{time}</span>
      </div>
      
      {/* Fastest lap badge */}
      {result.FastestLap?.rank === '1' && (
        <div className="absolute top-2 left-2 font-mono text-[8px] text-sector-purple border border-sector-purple/40 px-1 bg-sector-purple/10 font-bold uppercase rounded-sm">FL</div>
      )}
    </motion.div>
  )
}

function classifyStatus(status) {
  if (!status) return 'normal'
  const s = status.toLowerCase()
  if (s.includes('accident') || s.includes('collision')) return 'accident'
  if (s.includes('dnf') || s.includes('retired') || s.includes('mechanical') ||
      s.includes('engine') || s.includes('gearbox') || s.includes('power unit') ||
      s.includes('hydraulics') || s.includes('brakes') || s.includes('suspension') ||
      s.includes('electrical') || s.includes('overheating') || s.includes('driveshaft') ||
      s.includes('clutch') || s.includes('throttle') || s.includes('radiator') ||
      s.includes('water') || s.includes('oil') || s.includes('tyre') ||
      s.includes('puncture') || s.includes('damage') || s.includes('spin')) return 'dnf'
  if (s === 'disqualified' || s === 'dsq' || s === 'excluded') return 'dsq'
  if (s === 'dns' || s === 'did not start') return 'dns'
  return 'normal'
}

export default function Results() {
  const calendar   = useF1Store((s) => s.calendar)
  const results    = useF1Store((s) => s.results)
  const setResults = useF1Store((s) => s.setResults)

  const [selected, setSelected]    = useState(null)
  const [loadingRound, setLoading] = useState(null)
  const [error, setError]          = useState(null)
  const [showStory, setShowStory]  = useState(false)

  const now       = new Date()
  const pastRaces = calendar.filter((r) => new Date(r.date) < now)

  const { currentRace } = useRaceWeekendState()
  const nextRace = currentRace ?? calendar.find((r) => new Date(r.date) >= now) ?? null

  async function loadRound(round) {
    if (selected === round) { setSelected(null); setShowStory(false); return }
    setSelected(round); setShowStory(false)
    if (results[round]) return
    setLoading(round); setError(null)
    try {
      const res  = await fetch(`${BASE}/${round}/results.json`)
      const data = await res.json()
      const races = data?.MRData?.RaceTable?.Races
      if (!races?.length) { setResults(round, { empty: true }); return }
      setResults(round, races[0])
    } catch (e) {
      setError(`R${round}: ${e.message}`)
    } finally {
      setLoading(null)
    }
  }

  const selectedData = selected ? results[selected] : null

  return (
    <div className="min-h-full bg-pitwall-bg" style={{ background: 'var(--pw-bg)' }}>

      {/* Page header */}
      <div className="border-b border-pitwall-border px-6 py-4">
        <h1 className="font-display font-extrabold text-2xl tracking-widest uppercase text-pitwall-text-strong">
          Race Results
        </h1>
        <div className="font-mono text-xs mt-1 text-pitwall-dim">
          {pastRaces.length} completed rounds
        </div>
      </div>

      {/* Upcoming race banner */}
      {nextRace && (
        <div className="border-b border-pitwall-border px-6 py-2.5 flex items-center gap-4 bg-pitwall-surface-2/80 backdrop-blur-md">
          <span className="font-display text-[10px] tracking-widest font-bold uppercase text-pitwall-dim">
            Next GP
          </span>
          <span className="font-display font-bold text-sm tracking-wider text-pitwall-text-strong flex-1 truncate uppercase flex items-center gap-2">
            <span className="font-mono font-bold text-[10px] bg-pitwall-surface border border-pitwall-border px-1.5 py-0.5 rounded-sm text-status-red">
              {getFlag(nextRace.Circuit?.Location?.country)}
            </span>
            {nextRace.raceName}
          </span>
          <span className="font-mono text-xs text-pitwall-dim flex-shrink-0">
            {nextRace.date}
          </span>
          <Link to="/"
            className="font-display font-bold text-[10px] tracking-widest border border-pitwall-border px-3 py-1 bg-pitwall-surface rounded-sm hover:border-status-red/40 hover:text-status-red transition-colors text-pitwall-dim">
            RACE OVERVIEW
          </Link>
        </div>
      )}

      {/* Race selector tabs */}
      <div className="border-b border-pitwall-border bg-pitwall-surface">
        <div className="flex gap-0 overflow-x-auto divide-x divide-pitwall-border/40">
          {calendar.map((race) => {
            const isPast  = new Date(race.date) < now
            const isSelec = selected === race.round
            const country = race.Circuit?.Location?.country ?? ''
            return (
              <button
                key={race.round}
                onClick={() => isPast && loadRound(race.round)}
                disabled={!isPast}
                className={`flex-shrink-0 px-5 py-3 text-left transition-all min-w-[120px] select-none ${
                  !isPast ? 'opacity-20 cursor-not-allowed' :
                  isSelec ? 'border-b-2 border-b-status-red' :
                  'hover:bg-pitwall-surface-2 cursor-pointer border-b-2 border-b-transparent'
                }`}
                style={{
                  background: isSelec ? 'var(--pw-surface-2)' : 'transparent',
                }}
              >
                <div className="font-display text-[9px] font-bold text-pitwall-dim">ROUND {race.round}</div>
                <div className="mt-1 mb-1.5">
                  <span className="font-mono font-bold text-[10px] bg-pitwall-surface-2 border border-pitwall-border px-1.5 py-0.5 rounded-sm text-pitwall-text-strong">
                    {getFlag(country)}
                  </span>
                </div>
                <div className="font-display text-xs font-bold truncate max-w-[95px] uppercase text-pitwall-text-strong">
                  {race.raceName?.replace(' Grand Prix', '')}
                </div>
                {loadingRound === race.round && (
                  <div className="font-mono text-[9px] mt-0.5 animate-pulse text-pitwall-dim">
                    LOADING...
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 font-mono text-xs text-status-red border-b border-pitwall-border bg-status-red/10">
          Error: {error}
        </div>
      )}

      {selectedData?.empty && (
        <div className="px-6 py-8 font-mono text-sm text-pitwall-dim bg-carbon">
          Race not yet run — no results available
        </div>
      )}

      {selectedData && !selectedData.empty && (
        <div className="px-6 py-5 flex flex-col gap-6">

          {/* ── Podium ─────────────────────────────────────────── */}
          <div>
            <div className="font-display font-bold text-[11px] tracking-widest uppercase mb-4 text-status-red">
              Podium Standings — {selectedData.raceName?.toUpperCase()}
            </div>
            <div className="flex gap-3 items-end max-w-2xl">
              <PodiumCard result={(selectedData.Results ?? [])[1]} pos={2} />
              <PodiumCard result={(selectedData.Results ?? [])[0]} pos={1} />
              <PodiumCard result={(selectedData.Results ?? [])[2]} pos={3} />
            </div>
          </div>

          {/* ── Race Story Button ──────────────────────────────── */}
          <div>
            <button
              onClick={() => setShowStory((v) => !v)}
              className={`font-display font-bold text-[11px] tracking-widest px-4 py-2 border transition-all rounded-sm shadow-md active:scale-[0.98] ${
                showStory 
                  ? 'border-status-red text-status-red bg-status-red/10'
                  : 'border-pitwall-border text-pitwall-text bg-pitwall-surface hover:bg-pitwall-surface-2 hover:text-pitwall-text-strong'
              }`}
            >
              {showStory ? '▲ HIDE RACE STORY' : '▼ SHOW RACE STORY TIMELINE'}
            </button>
            {showStory && (
              <RaceStoryStack
                raceData={selectedData}
                sessionKey={null}
                onClose={() => setShowStory(false)}
              />
            )}
          </div>

          {/* ── Full classification ─────────────────────────────── */}
          <div>
            <div className="font-display font-bold text-[11px] tracking-widest uppercase mb-3 text-pitwall-dim font-semibold">
              Official Classification
            </div>

            <div className="border border-pitwall-border bg-pitwall-surface rounded-sm overflow-hidden shadow-sm">
              {/* Column headers */}
              <div className="flex items-center py-2 border-b border-pitwall-border bg-pitwall-surface-2 px-3">
                <div className="w-10 text-center font-display font-bold text-[10px] text-pitwall-dim">POS</div>
                <div className="w-[3px] mr-3" />
                <div className="flex-1 font-display font-bold text-[10px] text-pitwall-dim">DRIVER</div>
                <div className="w-36 hidden md:block font-display font-bold text-[10px] text-pitwall-dim">CONSTRUCTOR</div>
                <div className="w-12 text-center font-display font-bold text-[10px] text-pitwall-dim">LAPS</div>
                <div className="w-28 font-display font-bold text-[10px] text-pitwall-dim">STATUS</div>
                <div className="w-28 text-right font-display font-bold text-[10px] text-pitwall-dim">TIME/GAP</div>
                <div className="w-12 text-right pr-4 font-display font-bold text-[10px] text-pitwall-dim">PTS</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-pitwall-border/30">
                {(selectedData.Results ?? []).map((r, i) => {
                  const d          = r.Driver ?? {}
                  const team       = r.Constructor?.name ?? '—'
                  const col        = teamColour(team)
                  const statusType = classifyStatus(r.status)
                  const isDimmed   = statusType === 'dnf' || statusType === 'dsq' || statusType === 'dns' || statusType === 'accident'
                  const isLapped   = r.status?.startsWith('+') && r.status?.includes('Lap')
                  const hasFl      = r.FastestLap?.rank === '1'
                  const time       = r.Time?.time ?? (r.status?.startsWith('+') ? r.status : '—')

                  const statusColor = statusType === 'accident' ? '#FF6B00'
                    : statusType === 'dsq' ? 'var(--pw-purple)'
                    : statusType === 'dns' ? 'var(--pw-ghost)'
                    : isDimmed ? 'var(--pw-ghost)'
                    : 'var(--pw-dim)'

                  return (
                    <motion.div
                      key={r.number ?? i}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.4), ease: 'easeOut' }}
                      className={`flex items-center transition-colors py-2 px-3 ${isDimmed ? 'opacity-60' : 'hover:bg-pitwall-surface/40'}`}
                    >
                      {/* Position */}
                      <div className={`w-10 text-center font-display font-black text-sm italic ${i < 3 ? 'text-pitwall-text-strong' : 'text-pitwall-dim'}`}>
                        {r.position}
                      </div>

                      {/* Team color bar */}
                      <div className="w-[3px] h-5 mr-3 flex-shrink-0"
                         style={{ background: col }} />

                      {/* Driver */}
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="font-display font-extrabold text-sm tracking-wider" style={{ color: col }}>
                          {d.code ?? '???'}
                        </span>
                        <span className="font-body text-xs truncate" style={{ color: col }}>
                          {d.familyName}
                        </span>
                        {hasFl && (
                          <span className="font-mono text-[8.5px] text-sector-purple border border-sector-purple/30 px-1.5 py-0.5 bg-sector-purple/10 font-bold uppercase rounded-sm flex-shrink-0 flex items-center gap-1">
                            FL <span className="opacity-80 font-medium">({r.FastestLap?.Time?.time})</span>
                          </span>
                        )}
                      </div>

                      {/* Team */}
                      <div className="w-36 hidden md:block font-display font-bold text-xs text-pitwall-ghost truncate uppercase">
                        {team}
                      </div>

                      {/* Laps */}
                      <div className="w-12 text-center font-mono text-xs text-pitwall-text">
                        {r.laps}
                      </div>

                      {/* Status */}
                      <div className="w-28 font-mono text-xs truncate font-medium"
                        style={{ color: statusColor }}>
                        {r.status?.toUpperCase()}
                      </div>

                      {/* Time/Gap */}
                      <div className="w-28 text-right font-mono text-xs"
                        style={{ color: isLapped ? 'var(--pw-dim)' : 'var(--pw-text)' }}>
                        {time}
                      </div>

                      {/* Points */}
                      <div className="w-12 text-right pr-4 font-mono text-xs font-bold"
                        style={{ color: parseInt(r.points) > 0 ? 'var(--pw-yellow)' : 'var(--pw-ghost)' }}>
                        {r.points}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {!selected && (
        <div className="flex items-center justify-center bg-carbon py-16 px-4">
          <EmptyState
            icon="🏁"
            title="Awaiting Race Selection"
            message="Select a completed round above to load full race classifications, podiums, and story timelines."
          />
        </div>
      )}
    </div>
  )
}
