import { useState } from 'react'
import { Link } from 'react-router-dom'
import useF1Store from '../store/useF1Store'
import useRaceWeekendState from '../hooks/useRaceWeekendState'
import RaceStoryStack from '../components/results/RaceStoryStack'

const BASE = 'https://api.jolpi.ca/ergast/f1/2026'

const FLAGS = {
  Japan: '🇯🇵', Australia: '🇦🇺', China: '🇨🇳', Bahrain: '🇧🇭',
  'Saudi Arabia': '🇸🇦', 'United States': '🇺🇸', 'United Arab Emirates': '🇦🇪',
  Brazil: '🇧🇷', Mexico: '🇲🇽', Italy: '🇮🇹', Spain: '🇪🇸',
  Monaco: '🇲🇨', Canada: '🇨🇦', Austria: '🇦🇹', 'United Kingdom': '🇬🇧',
  Belgium: '🇧🇪', Netherlands: '🇳🇱', Hungary: '🇭🇺',
  Azerbaijan: '🇦🇿', Singapore: '🇸🇬', Qatar: '🇶🇦',
}
function getFlag(country) { return FLAGS[country] ?? '🏁' }

const TEAM_COLOUR_MAP = {
  'Red Bull': '#3671C6', Ferrari: '#E8002D', Mercedes: '#27F4D2',
  McLaren: '#FF8000', 'Aston Martin': '#229971', Alpine: '#FF87BC',
  Williams: '#64C4FF', RB: '#6692FF', Haas: '#B6BABD', Sauber: '#52E252',
}
function teamColour(name) {
  return Object.entries(TEAM_COLOUR_MAP).find(([k]) =>
    name?.toLowerCase().includes(k.toLowerCase())
  )?.[1] ?? '#666'
}

// ── Podium card — team-color gradient bg, readable text ────────────────────────
function PodiumCard({ result, pos }) {
  if (!result) return null
  const d    = result.Driver ?? {}
  const team = result.Constructor?.name ?? ''
  const code = d.code ?? '???'
  const time = result.Time?.time ?? result.status ?? '—'
  const col  = teamColour(team)

  return (
    <div
      className={`flex-1 border border-pitwall-border p-4 flex flex-col gap-1 relative overflow-hidden ${pos === 1 ? '' : ''}`}
      style={{
        borderTop: `3px solid ${col}`,
        background: `linear-gradient(160deg, ${col}20 0%, ${col}08 60%, transparent 100%)`,
        minHeight: pos === 1 ? 140 : 110,
      }}
    >
      {/* Position */}
      <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--pw-ghost)' }}>
        P{pos}
      </div>
      {/* Driver code — team color, large */}
      <div
        className={`font-display font-bold tracking-wider ${pos === 1 ? 'text-4xl' : 'text-2xl'}`}
        style={{ color: col }}
      >
        {code}
      </div>
      {/* Full name */}
      <div className="font-body text-sm font-medium" style={{ color: 'var(--pw-text)' }}>
        {d.familyName}
      </div>
      {/* Team */}
      <div className="font-body text-xs" style={{ color: 'var(--pw-dim)' }}>
        {team}
      </div>
      {/* Time */}
      <div className="font-mono text-xs mt-auto pt-2 font-semibold" style={{ color: 'var(--pw-text-strong)' }}>
        {time}
      </div>
      {/* Fastest lap badge */}
      {result.FastestLap?.rank === '1' && (
        <div className="absolute top-2 right-2 font-mono text-[9px] text-sector-purple border border-sector-purple/40 px-1">FL</div>
      )}
    </div>
  )
}

// ── Status classification ────────────────────────────────────────────────────
// Only DNF / DNS / Accident / Disqualified are dimmed.
// Lapped cars (+1 Lap, +2 Laps, etc.) are NOT dimmed — just shown normally.
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

  // Upcoming race context
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
    <div className="min-h-full" style={{ background: 'var(--pw-bg)' }}>

      {/* Page header */}
      <div className="border-b border-pitwall-border px-6 py-4">
        <h1 className="font-display font-bold text-3xl tracking-widest uppercase"
          style={{ color: 'var(--pw-text-strong)' }}>
          Results
        </h1>
        <div className="font-mono text-xs mt-1" style={{ color: 'var(--pw-dim)' }}>
          {pastRaces.length} completed rounds
        </div>
      </div>

      {/* Upcoming race banner */}
      {nextRace && (
        <div className="border-b border-pitwall-border px-6 py-2.5 flex items-center gap-4"
          style={{ background: 'var(--pw-surface)' }}>
          <span className="font-mono text-[10px] tracking-widest uppercase flex-shrink-0"
            style={{ color: 'var(--pw-ghost)' }}>
            Next Race
          </span>
          <span className="font-display font-semibold text-sm tracking-wide flex-1 truncate"
            style={{ color: 'var(--pw-text)' }}>
            {getFlag(nextRace.Circuit?.Location?.country)} {nextRace.raceName}
          </span>
          <span className="font-mono text-xs flex-shrink-0" style={{ color: 'var(--pw-dim)' }}>
            {nextRace.date}
          </span>
          <Link to="/"
            className="font-mono text-[10px] tracking-widest border border-pitwall-border px-2 py-0.5 flex-shrink-0 transition-colors hover:border-status-red/50 hover:text-status-red"
            style={{ color: 'var(--pw-ghost)' }}>
            DETAILS →
          </Link>
        </div>
      )}

      {/* Race selector tabs */}
      <div className="border-b border-pitwall-border" style={{ background: 'var(--pw-surface)' }}>
        <div className="flex gap-0 overflow-x-auto">
          {calendar.map((race) => {
            const isPast  = new Date(race.date) < now
            const isSelec = selected === race.round
            const country = race.Circuit?.Location?.country ?? ''
            return (
              <button
                key={race.round}
                onClick={() => isPast && loadRound(race.round)}
                disabled={!isPast}
                className={`flex-shrink-0 px-4 py-3 border-r border-pitwall-border text-left transition-colors min-w-[110px] ${
                  !isPast ? 'cursor-not-allowed' :
                  isSelec ? 'border-b-2 border-b-status-red' :
                  'hover:bg-pitwall-surface/70 cursor-pointer border-b-2 border-b-transparent'
                }`}
                style={{
                  opacity: !isPast ? 0.3 : 1,
                  background: isSelec ? 'var(--pw-bg)' : 'transparent',
                }}
              >
                <div className="font-mono text-[10px]" style={{ color: 'var(--pw-ghost)' }}>R{race.round}</div>
                <div className="text-base mt-0.5">{getFlag(country)}</div>
                <div className="font-display text-xs truncate max-w-[90px]"
                  style={{ color: 'var(--pw-text)' }}>
                  {race.raceName?.replace(' Grand Prix', '')}
                </div>
                {loadingRound === race.round && (
                  <div className="font-mono text-[9px] mt-0.5 animate-pulse" style={{ color: 'var(--pw-dim)' }}>
                    loading…
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 font-mono text-xs text-status-red border-b border-pitwall-border">
          Error: {error}
        </div>
      )}

      {selectedData?.empty && (
        <div className="px-6 py-8 font-mono" style={{ color: 'var(--pw-dim)' }}>
          Race not yet run — no results available
        </div>
      )}

      {selectedData && !selectedData.empty && (
        <div className="px-6 py-5 flex flex-col gap-5">

          {/* ── Podium ─────────────────────────────────────────── */}
          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase mb-3"
              style={{ color: 'var(--pw-ghost)' }}>
              Podium — {selectedData.raceName}
            </div>
            <div className="flex gap-2 items-end max-w-2xl">
              <PodiumCard result={(selectedData.Results ?? [])[1]} pos={2} />
              <PodiumCard result={(selectedData.Results ?? [])[0]} pos={1} />
              <PodiumCard result={(selectedData.Results ?? [])[2]} pos={3} />
            </div>
          </div>

          {/* ── Race Story ─────────────────────────────────────── */}
          <div>
            <button
              onClick={() => setShowStory((v) => !v)}
              className="font-mono text-[11px] tracking-widest px-4 py-2 border transition-colors"
              style={{
                borderColor: showStory ? 'var(--pw-red)' : 'var(--pw-border)',
                color: showStory ? 'var(--pw-red)' : 'var(--pw-ghost)',
                background: showStory ? 'rgba(232,0,45,0.08)' : 'transparent',
              }}
            >
              {showStory ? '▲ HIDE RACE STORY' : '▼ SHOW RACE STORY'}
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
            <div className="font-mono text-[10px] tracking-widest uppercase mb-0"
              style={{ color: 'var(--pw-ghost)' }}>
              Full Classification
            </div>

            {/* Column headers */}
            <div className="flex items-center py-1.5 border-y border-pitwall-border mt-2"
              style={{ background: 'var(--pw-surface)' }}>
              <div className="w-10 text-center font-mono text-[10px]" style={{ color: 'var(--pw-ghost)' }}>POS</div>
              <div className="w-1 mr-3" />
              <div className="flex-1 font-mono text-[10px]" style={{ color: 'var(--pw-ghost)' }}>DRIVER</div>
              <div className="w-36 hidden md:block font-mono text-[10px]" style={{ color: 'var(--pw-ghost)' }}>TEAM</div>
              <div className="w-12 text-center font-mono text-[10px]" style={{ color: 'var(--pw-ghost)' }}>LAPS</div>
              <div className="w-28 font-mono text-[10px]" style={{ color: 'var(--pw-ghost)' }}>STATUS</div>
              <div className="w-28 text-right font-mono text-[10px]" style={{ color: 'var(--pw-ghost)' }}>TIME/GAP</div>
              <div className="w-12 text-right pr-4 font-mono text-[10px]" style={{ color: 'var(--pw-ghost)' }}>PTS</div>
            </div>

            {/* Rows */}
            {(selectedData.Results ?? []).map((r, i) => {
              const d          = r.Driver ?? {}
              const team       = r.Constructor?.name ?? '—'
              const col        = teamColour(team)
              const statusType = classifyStatus(r.status)
              const isDimmed   = statusType === 'dnf' || statusType === 'dsq' || statusType === 'dns' || statusType === 'accident'
              const isLapped   = r.status?.startsWith('+') && r.status?.includes('Lap')
              const hasFl      = r.FastestLap?.rank === '1'
              const time       = r.Time?.time ?? (r.status?.startsWith('+') ? r.status : '—')

              // Status color
              const statusColor = statusType === 'accident' ? '#FF6B00'
                : statusType === 'dsq' ? '#B468FF'
                : statusType === 'dns' ? '#888'
                : isDimmed ? '#666'
                : '#555'

              return (
                <div
                  key={r.number ?? i}
                  className="flex items-center border-b border-pitwall-border transition-colors"
                  style={{
                    opacity: isDimmed ? 0.55 : 1,
                    background: isDimmed ? 'transparent' : 'transparent',
                    paddingTop: 7,
                    paddingBottom: 7,
                  }}
                  onMouseEnter={(e) => { if (!isDimmed) e.currentTarget.style.background = 'var(--pw-surface)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Position */}
                  <div className={`w-10 text-center font-mono text-sm ${i < 3 ? 'font-bold' : ''}`}
                    style={{ color: i < 3 ? 'var(--pw-text-strong)' : 'var(--pw-dim)' }}>
                    {r.position}
                  </div>

                  {/* Team color bar */}
                  <div className="w-1 h-5 rounded-sm mr-3 flex-shrink-0"
                    style={{ background: col }} />

                  {/* Driver */}
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="font-mono font-semibold text-sm"
                      style={{ color: 'var(--pw-text-strong)' }}>
                      {d.code ?? '???'}
                    </span>
                    <span className="font-body text-xs truncate"
                      style={{ color: 'var(--pw-dim)' }}>
                      {d.familyName}
                    </span>
                    {hasFl && (
                      <span className="font-mono text-[9px] text-sector-purple border border-sector-purple/40 px-1 flex-shrink-0">FL</span>
                    )}
                  </div>

                  {/* Team */}
                  <div className="w-36 hidden md:block font-body text-xs truncate"
                    style={{ color: 'var(--pw-ghost)' }}>
                    {team}
                  </div>

                  {/* Laps */}
                  <div className="w-12 text-center font-mono text-xs"
                    style={{ color: 'var(--pw-dim)' }}>
                    {r.laps}
                  </div>

                  {/* Status */}
                  <div className="w-28 font-mono text-xs truncate"
                    style={{ color: statusColor }}>
                    {r.status}
                  </div>

                  {/* Time/Gap */}
                  <div className="w-28 text-right font-mono text-xs"
                    style={{ color: isLapped ? 'var(--pw-dim)' : 'var(--pw-text)' }}>
                    {time}
                  </div>

                  {/* Points */}
                  <div className="w-12 text-right pr-4 font-mono text-xs font-semibold"
                    style={{ color: parseInt(r.points) > 0 ? 'var(--pw-text-strong)' : 'var(--pw-ghost)' }}>
                    {r.points}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!selected && (
        <div className="flex items-center justify-center h-48 font-mono text-sm"
          style={{ color: 'var(--pw-ghost)' }}>
          Select a completed race above to view results
        </div>
      )}
    </div>
  )
}
