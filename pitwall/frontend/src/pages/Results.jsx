import { useState } from 'react'
import useF1Store from '../store/useF1Store'

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
  )?.[1] ?? '#444'
}

function PodiumCard({ result, pos }) {
  if (!result) return null
  const d    = result.Driver ?? {}
  const team = result.Constructor?.name ?? ''
  const code = d.code ?? '???'
  const time = result.Time?.time ?? result.status ?? '—'
  const col  = teamColour(team)
  return (
    <div
      className={`flex-1 border border-pitwall-border p-3 flex flex-col gap-1 ${pos === 1 ? 'bg-[#141414]' : 'bg-pitwall-surface'}`}
      style={{ borderTop: `3px solid ${col}` }}
    >
      <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest">P{pos}</div>
      <div className={`font-display font-bold text-white ${pos === 1 ? 'text-3xl' : 'text-xl'}`}>{code}</div>
      <div className="font-body text-xs text-pitwall-dim">{d.familyName}</div>
      <div className="font-mono text-xs text-pitwall-ghost mt-1">{time}</div>
    </div>
  )
}

export default function Results() {
  const calendar   = useF1Store((s) => s.calendar)
  const results    = useF1Store((s) => s.results)
  const setResults = useF1Store((s) => s.setResults)

  const [selected, setSelected]   = useState(null)
  const [loadingRound, setLoading] = useState(null)
  const [error, setError]          = useState(null)

  const now = new Date()
  const pastRaces = calendar.filter((r) => new Date(r.date) < now)

  async function loadRound(round) {
    if (selected === round) { setSelected(null); return }
    setSelected(round)
    if (results[round]) return
    setLoading(round)
    setError(null)
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
    <div className="min-h-full bg-pitwall-bg">
      {/* Header */}
      <div className="border-b border-pitwall-border px-6 py-4">
        <h1 className="font-display font-bold text-3xl tracking-widest text-white uppercase">Results</h1>
        <div className="font-mono text-xs text-pitwall-dim mt-1">
          {pastRaces.length} completed rounds
        </div>
      </div>

      {/* Race selector */}
      <div className="border-b border-pitwall-border">
        {/* Horizontal scroll of completed rounds */}
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
                className={`flex-shrink-0 px-4 py-3 border-r border-pitwall-border text-left transition-colors min-w-[120px] ${
                  !isPast ? 'opacity-30 cursor-not-allowed' :
                  isSelec ? 'bg-pitwall-surface border-b-2 border-b-status-red' :
                  'hover:bg-pitwall-surface/50 cursor-pointer border-b-2 border-b-transparent'
                }`}
              >
                <div className="font-mono text-[10px] text-pitwall-ghost">R{race.round}</div>
                <div className="text-base mt-0.5">{getFlag(country)}</div>
                <div className="font-display text-xs text-pitwall-text truncate max-w-[100px]">
                  {race.raceName?.replace(' Grand Prix', '')}
                </div>
                {loadingRound === race.round && (
                  <div className="font-mono text-[9px] text-pitwall-dim mt-0.5">loading…</div>
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

      {/* Race detail */}
      {selectedData?.empty && (
        <div className="px-6 py-8 font-body text-pitwall-dim">
          Race not yet run — no results available
        </div>
      )}

      {selectedData && !selectedData.empty && (
        <div className="px-6 py-6 flex flex-col gap-6">
          {/* Podium */}
          <div>
            <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase mb-3">Podium</div>
            <div className="flex gap-2 items-end max-w-xl">
              <PodiumCard result={(selectedData.Results ?? [])[1]} pos={2} />
              <PodiumCard result={(selectedData.Results ?? [])[0]} pos={1} />
              <PodiumCard result={(selectedData.Results ?? [])[2]} pos={3} />
            </div>
          </div>

          {/* Full classification */}
          <div>
            <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase mb-2">
              Full Classification
            </div>
            {/* Headers */}
            <div className="flex items-center gap-0 py-1.5 border-b border-pitwall-border bg-[#0d0d0d]">
              <div className="w-10 text-center font-mono text-[10px] text-pitwall-ghost">POS</div>
              <div className="w-1 mr-2" />
              <div className="flex-1 font-mono text-[10px] text-pitwall-ghost">DRIVER</div>
              <div className="w-32 hidden md:block font-mono text-[10px] text-pitwall-ghost">TEAM</div>
              <div className="w-12 text-center font-mono text-[10px] text-pitwall-ghost">LAPS</div>
              <div className="w-20 font-mono text-[10px] text-pitwall-ghost">STATUS</div>
              <div className="w-24 text-right font-mono text-[10px] text-pitwall-ghost">TIME/GAP</div>
              <div className="w-12 text-right pr-4 font-mono text-[10px] text-pitwall-ghost">PTS</div>
            </div>

            {(selectedData.Results ?? []).map((r, i) => {
              const d        = r.Driver ?? {}
              const team     = r.Constructor?.name ?? '—'
              const col      = teamColour(team)
              const isDNF    = !['Finished', '+1 Lap', '+2 Laps'].includes(r.status) && !r.status?.startsWith('+')
              const hasFl    = r.FastestLap?.rank === '1'
              const time     = r.Time?.time ?? (r.status?.startsWith('+') ? r.status : '—')
              return (
                <div
                  key={r.number}
                  className={`flex items-center gap-0 py-2 border-b border-pitwall-border ${isDNF ? 'opacity-50' : 'hover:bg-pitwall-surface/30'} transition-colors`}
                >
                  <div className={`w-10 text-center font-mono text-sm ${i < 3 ? 'text-white font-bold' : 'text-pitwall-dim'}`}>
                    {r.position}
                  </div>
                  <div className="w-1 h-4 rounded-sm mr-2" style={{ backgroundColor: col }} />
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="font-mono font-medium text-sm text-white">{d.code ?? '???'}</span>
                    <span className="font-body text-xs text-pitwall-dim truncate">{d.familyName}</span>
                    {hasFl && <span className="font-mono text-[10px] text-sector-purple border border-sector-purple/40 px-1">FL</span>}
                  </div>
                  <div className="w-32 hidden md:block font-body text-xs text-pitwall-ghost truncate">{team}</div>
                  <div className="w-12 text-center font-mono text-xs text-pitwall-dim">{r.laps}</div>
                  <div className={`w-20 font-mono text-xs truncate ${isDNF ? 'text-status-red' : 'text-pitwall-dim'}`}>{r.status}</div>
                  <div className="w-24 text-right font-mono text-xs text-pitwall-text">{time}</div>
                  <div className="w-12 text-right pr-4 font-mono text-xs text-pitwall-dim">{r.points}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!selected && (
        <div className="flex items-center justify-center h-48 font-mono text-pitwall-ghost text-sm">
          Select a completed race above to view results
        </div>
      )}
    </div>
  )
}
