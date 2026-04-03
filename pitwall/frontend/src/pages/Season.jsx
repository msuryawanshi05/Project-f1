import { useState } from 'react'
import useF1Store from '../store/useF1Store'
import circuits from '../data/circuits.json'
import CircuitDetailPanel from '../components/season/CircuitDetailPanel'

const FLAGS = {
  Japan: '🇯🇵', Australia: '🇦🇺', China: '🇨🇳', Bahrain: '🇧🇭',
  'Saudi Arabia': '🇸🇦', 'United States': '🇺🇸', 'United Arab Emirates': '🇦🇪',
  Brazil: '🇧🇷', Mexico: '🇲🇽', Italy: '🇮🇹', Spain: '🇪🇸',
  Monaco: '🇲🇨', Canada: '🇨🇦', Austria: '🇦🇹', 'United Kingdom': '🇬🇧',
  Belgium: '🇧🇪', Netherlands: '🇳🇱', Hungary: '🇭🇺',
  Azerbaijan: '🇦🇿', Singapore: '🇸🇬', Qatar: '🇶🇦',
}

function matchCircuit(race) {
  const rn = (race.raceName ?? '').toLowerCase().replace(' grand prix', '').trim()
  return circuits.find((c) => {
    const cn = (c.name ?? '').toLowerCase().replace(' grand prix', '').trim()
    return cn.includes(rn) || rn.includes(cn)
  })
}

export default function Season() {
  const calendar        = useF1Store((s) => s.calendar)
  const calendarLoading = useF1Store((s) => s.calendarLoading)
  const [selectedRace, setSelectedRace] = useState(null)

  if (calendarLoading) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-pitwall-dim text-sm">
        Loading season data…
      </div>
    )
  }

  const now = new Date()

  function selectRace(race) {
    setSelectedRace((prev) => (prev?.round === race.round ? null : race))
  }

  const selectedCircuit = selectedRace ? matchCircuit(selectedRace) : null

  return (
    <div className="min-h-full bg-pitwall-bg relative">
      {/* Header */}
      <div className="border-b border-pitwall-border px-6 py-4">
        <h1 className="font-display font-bold text-3xl tracking-widest text-white uppercase">
          2026 Season
        </h1>
        <div className="font-mono text-xs text-pitwall-dim mt-1">
          {calendar.length} rounds · Formula 1 World Championship
        </div>
      </div>

      {/* Race list — shrinks when panel is open */}
      <div
        className="divide-y divide-pitwall-border transition-all duration-300"
        style={{ marginRight: selectedRace ? 480 : 0 }}
      >
        {calendar.map((race) => {
          const circuitData = matchCircuit(race)
          const country     = race.Circuit?.Location?.country ?? ''
          const flag        = FLAGS[country] ?? '🏁'
          const isPast      = new Date(race.date) < now
          const isNext      = !isPast && calendar.filter((r) => new Date(r.date) >= now)[0]?.round === race.round
          const isSelected  = selectedRace?.round === race.round

          return (
            <div
              key={race.round}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && selectRace(race)}
              onClick={() => selectRace(race)}
              className={`flex items-center gap-4 px-6 py-3 transition-colors cursor-pointer select-none ${
                isSelected     ? 'bg-[#141414]' :
                isPast         ? 'opacity-50 hover:bg-pitwall-surface/30' :
                isNext         ? 'bg-pitwall-surface hover:bg-pitwall-surface/80' :
                                 'hover:bg-pitwall-surface/50'
              }`}
              style={isNext ? { borderLeft: '3px solid #E8002D' } : { borderLeft: `3px solid ${isSelected ? '#E8002D' : 'transparent'}` }}
            >
              {/* Round */}
              <div className="w-8 flex-shrink-0 font-mono text-xs text-pitwall-ghost text-right">
                R{race.round}
              </div>

              {/* Flag */}
              <div className="text-xl flex-shrink-0">{flag}</div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold text-sm tracking-wide text-pitwall-text truncate">
                  {race.raceName}
                </div>
                <div className="font-mono text-xs text-pitwall-ghost truncate">
                  {race.Circuit?.circuitName ?? ''} · {country}
                </div>
              </div>

              {/* Sprint badge */}
              {circuitData?.sprint && (
                <div className="flex-shrink-0 font-mono text-[10px] text-status-yellow border border-status-yellow/40 px-1.5 py-0.5 tracking-widest">
                  SPRINT
                </div>
              )}

              {/* Date */}
              <div className="flex-shrink-0 font-mono text-xs text-pitwall-dim w-24 text-right">
                {race.date}
              </div>

              {/* Status */}
              {isPast && (
                <div className="flex-shrink-0 font-mono text-[10px] text-pitwall-ghost border border-pitwall-muted px-1.5 py-0.5">
                  DONE
                </div>
              )}
              {isNext && !isSelected && (
                <div className="flex-shrink-0 font-mono text-[10px] text-status-red border border-status-red/40 px-1.5 py-0.5">
                  NEXT
                </div>
              )}
              {isSelected && (
                <div className="flex-shrink-0 font-mono text-[10px] text-[#E8002D]">›</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Circuit detail panel */}
      {selectedRace && (
        <CircuitDetailPanel
          race={selectedRace}
          circuitData={selectedCircuit}
          onClose={() => setSelectedRace(null)}
        />
      )}
    </div>
  )
}
